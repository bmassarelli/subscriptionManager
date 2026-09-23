package com.subscriptionmanager.service.resource;

import com.subscriptionmanager.dto.ResourceDTO;
import com.subscriptionmanager.dto.ResourceRequestDTO;
import com.subscriptionmanager.entity.Client;
import com.subscriptionmanager.entity.Resource;
import com.subscriptionmanager.entity.Subscription;
import com.subscriptionmanager.repository.ResourceRepository;
import com.subscriptionmanager.repository.SubscriptionRepository;
import com.subscriptionmanager.service.lifecycle.SubscriptionNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ResourceServiceTest {

    @Mock
    private SubscriptionRepository subscriptionRepository;

    @Mock
    private ResourceRepository resourceRepository;

    private ResourceService service;
    private Subscription subscription;

    @BeforeEach
    void setUp() {
        service = new ResourceService(subscriptionRepository, resourceRepository);
        Client client = new Client(1L, "John", "Doe", "john@doe.com", "+11234567890");
        subscription = new Subscription(1L, client, "CONTR_001", "AC",
                LocalDate.now(), new BigDecimal("10.00"));
        com.subscriptionmanager.entity.Service svc =
                new com.subscriptionmanager.entity.Service(subscription, "MOBILE_BSCS9", null, null);
        svc.setId(100L);
        subscription.setService(svc);
    }

    @Test
    void listsResourcesOfARecognizedType() {
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));
        Resource resource = new Resource(subscription.getService(), "IP", "10.0.0.1");
        resource.setId(1L);
        when(resourceRepository.findByService_Subscription_IdOrderByIdAsc(1L)).thenReturn(List.of(resource));

        List<ResourceDTO> result = service.getResources(1L);

        assertEquals(1, result.size());
        assertEquals("IP", result.get(0).getResourceType());
        assertEquals("10.0.0.1", result.get(0).getValue());
    }

    @Test
    void listsEmptyWhenNoneAssigned() {
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));
        when(resourceRepository.findByService_Subscription_IdOrderByIdAsc(1L)).thenReturn(List.of());

        assertTrue(service.getResources(1L).isEmpty());
    }

    @Test
    void listingThrowsWhenSubscriptionNotFound() {
        when(subscriptionRepository.findById(999L)).thenReturn(Optional.empty());

        assertThrows(SubscriptionNotFoundException.class, () -> service.getResources(999L));
    }

    @Test
    void addsAResourceAndReturnsIt() {
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));
        ArgumentCaptor<Resource> captor = ArgumentCaptor.forClass(Resource.class);
        when(resourceRepository.save(captor.capture())).thenAnswer(invocation -> {
            Resource saved = captor.getValue();
            saved.setId(5L);
            return saved;
        });

        ResourceRequestDTO request = new ResourceRequestDTO();
        request.setResourceType("VLAN");
        request.setValue("100");

        ResourceDTO result = service.addResource(1L, request);

        assertEquals(5L, result.getId());
        assertEquals("VLAN", result.getResourceType());
        assertEquals("100", result.getValue());
        assertEquals(1L, result.getSubscriptionId());
    }

    @Test
    void addingWithAnUnrecognizedTypeThrows() {
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));

        ResourceRequestDTO request = new ResourceRequestDTO();
        request.setResourceType("BOGUS");
        request.setValue("whatever");

        assertThrows(InvalidResourceTypeException.class, () -> service.addResource(1L, request));
        verify(resourceRepository, never()).save(any());
    }

    @Test
    void allowsMultipleResourcesOfTheSameType() {
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));
        when(resourceRepository.save(any(Resource.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ResourceRequestDTO first = new ResourceRequestDTO();
        first.setResourceType("IP");
        first.setValue("10.0.0.1");
        ResourceRequestDTO second = new ResourceRequestDTO();
        second.setResourceType("IP");
        second.setValue("10.0.0.2");

        ResourceDTO firstResult = service.addResource(1L, first);
        ResourceDTO secondResult = service.addResource(1L, second);

        assertEquals("IP", firstResult.getResourceType());
        assertEquals("IP", secondResult.getResourceType());
        assertNotEquals(firstResult.getValue(), secondResult.getValue());
        verify(resourceRepository, times(2)).save(any(Resource.class));
    }

    @Test
    void deletesAResource() {
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));
        Resource resource = new Resource(subscription.getService(), "IP", "10.0.0.1");
        resource.setId(7L);
        when(resourceRepository.findById(7L)).thenReturn(Optional.of(resource));

        service.deleteResource(1L, 7L);

        verify(resourceRepository).delete(resource);
    }

    @Test
    void deletingThrowsWhenResourceNotFound() {
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));
        when(resourceRepository.findById(999L)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> service.deleteResource(1L, 999L));
    }

    @Test
    void deletingThrowsWhenResourceBelongsToAnotherSubscription() {
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));
        Client otherClient = new Client(2L, "Jane", "Roe", "jane@roe.com", "+19998887777");
        Subscription otherSubscription = new Subscription(2L, otherClient, "CONTR_002",
                "AC", LocalDate.now(), new BigDecimal("5.00"));
        com.subscriptionmanager.entity.Service otherService =
                new com.subscriptionmanager.entity.Service(otherSubscription, "FIXED_BSCS7", null, null);
        otherService.setId(200L);
        otherSubscription.setService(otherService);
        Resource resource = new Resource(otherSubscription.getService(), "IP", "10.0.0.1");
        resource.setId(7L);
        when(resourceRepository.findById(7L)).thenReturn(Optional.of(resource));

        assertThrows(ResourceNotFoundException.class, () -> service.deleteResource(1L, 7L));
        verify(resourceRepository, never()).delete(any());
    }
}
