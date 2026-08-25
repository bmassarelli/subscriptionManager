package com.subscriptionmanager.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.subscriptionmanager.dto.SubscriptionDetailDTO;
import com.subscriptionmanager.dto.SubscriptionRequestDTO;
import com.subscriptionmanager.entity.Client;
import com.subscriptionmanager.entity.Operation;
import com.subscriptionmanager.entity.Platform;
import com.subscriptionmanager.entity.ProductOffering;
import com.subscriptionmanager.entity.Subscription;
import com.subscriptionmanager.repository.ClientRepository;
import com.subscriptionmanager.repository.OperationRepository;
import com.subscriptionmanager.repository.PaymentModeRepository;
import com.subscriptionmanager.repository.PlatformRepository;
import com.subscriptionmanager.repository.ProductOfferingRepository;
import com.subscriptionmanager.repository.SubscriptionRepository;
import com.subscriptionmanager.service.lifecycle.LifecycleActionRegistry;
import com.subscriptionmanager.service.lifecycle.SubscriptionNotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SubscriptionServiceTest {

    @Mock private SubscriptionRepository subscriptionRepository;
    @Mock private ClientRepository clientRepository;
    @Mock private PlatformRepository platformRepository;
    @Mock private PaymentModeRepository paymentModeRepository;
    @Mock private ProductOfferingRepository productOfferingRepository;
    @Mock private OperationRepository operationRepository;
    @Mock private LifecycleActionRegistry actionRegistry;

    private SubscriptionService newService() {
        OperationRecorder operationRecorder = new OperationRecorder(operationRepository, new ObjectMapper());
        return new SubscriptionService(subscriptionRepository, clientRepository, platformRepository,
                paymentModeRepository, productOfferingRepository, operationRecorder, actionRegistry);
    }

    @Test
    void recordsCreateOperationWhenSubscriptionIsCreated() {
        SubscriptionService service = newService();

        Client client = new Client(1L, "John", "Doe", "john@doe.com", "+11234567890");
        when(clientRepository.findById(1L)).thenReturn(Optional.of(client));
        when(platformRepository.findByName("MOBILE_BSCS9")).thenReturn(Optional.of(new Platform(1L, "MOBILE_BSCS9")));
        when(subscriptionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        SubscriptionRequestDTO request = new SubscriptionRequestDTO();
        request.setClientId(1L);
        request.setPlatform("MOBILE_BSCS9");
        request.setContract("CONTR_001");
        request.setAmount(new BigDecimal("10.00"));

        service.create(request);

        ArgumentCaptor<Operation> captor = ArgumentCaptor.forClass(Operation.class);
        verify(operationRepository).save(captor.capture());
        assertEquals("CREATE", captor.getValue().getOperationType());
        assertEquals("COMPLETED", captor.getValue().getStatus());
    }

    @Test
    void resolvesAndPersistsProductOfferingWhenPoIsProvided() {
        SubscriptionService service = newService();

        Client client = new Client(1L, "John", "Doe", "john@doe.com", "+11234567890");
        when(clientRepository.findById(1L)).thenReturn(Optional.of(client));
        when(platformRepository.findByName("MOBILE_BSCS9")).thenReturn(Optional.of(new Platform(1L, "MOBILE_BSCS9")));
        when(productOfferingRepository.findByName("claroVideo"))
                .thenReturn(Optional.of(new ProductOffering(1L, "claroVideo")));
        when(subscriptionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        SubscriptionRequestDTO request = new SubscriptionRequestDTO();
        request.setClientId(1L);
        request.setPlatform("MOBILE_BSCS9");
        request.setContract("CONTR_001");
        request.setAmount(new BigDecimal("10.00"));
        request.setPo("claroVideo");

        var result = service.create(request);

        assertEquals("claroVideo", result.getPo());
    }

    @Test
    void throwsInvalidProductOfferingForUnknownPoName() {
        SubscriptionService service = newService();

        Client client = new Client(1L, "John", "Doe", "john@doe.com", "+11234567890");
        when(clientRepository.findById(1L)).thenReturn(Optional.of(client));
        when(platformRepository.findByName("MOBILE_BSCS9")).thenReturn(Optional.of(new Platform(1L, "MOBILE_BSCS9")));
        when(productOfferingRepository.findByName("unknownOffering")).thenReturn(Optional.empty());

        SubscriptionRequestDTO request = new SubscriptionRequestDTO();
        request.setClientId(1L);
        request.setPlatform("MOBILE_BSCS9");
        request.setContract("CONTR_001");
        request.setAmount(new BigDecimal("10.00"));
        request.setPo("unknownOffering");

        assertThrows(InvalidProductOfferingException.class, () -> service.create(request));
    }

    private Subscription buildSubscription(String status) {
        Client client = new Client(1L, "John", "Doe", "john@doe.com", "+11234567890");
        return new Subscription(1L, client, "MOBILE_BSCS9", "CONTR_001", status, LocalDate.now(), new BigDecimal("10.00"));
    }

    @Test
    void returnsFullDetailWithAvailableActionsForExistingSubscription() {
        SubscriptionService service = newService();
        Subscription subscription = buildSubscription("AC");
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));
        when(actionRegistry.availableActionsFor("AC")).thenReturn(List.of("SUSPEND", "CANCEL"));

        SubscriptionDetailDTO detail = service.getById(1L);

        assertEquals("John Doe", detail.getClientName());
        assertEquals("AC", detail.getStatus());
        assertEquals(List.of("SUSPEND", "CANCEL"), detail.getAvailableActions());
    }

    @Test
    void throwsNotFoundForNonExistentSubscription() {
        SubscriptionService service = newService();
        when(subscriptionRepository.findById(999L)).thenReturn(Optional.empty());

        assertThrows(SubscriptionNotFoundException.class, () -> service.getById(999L));
    }

    @Test
    void availableActionsIsEmptyForCancelledSubscription() {
        SubscriptionService service = newService();
        Subscription subscription = buildSubscription("CA");
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));
        when(actionRegistry.availableActionsFor("CA")).thenReturn(List.of());

        SubscriptionDetailDTO detail = service.getById(1L);

        assertTrue(detail.getAvailableActions().isEmpty());
    }
}
