package com.subscriptionmanager.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.subscriptionmanager.dto.SubscriptionDTO;
import com.subscriptionmanager.dto.SubscriptionDetailDTO;
import com.subscriptionmanager.dto.SubscriptionRequestDTO;
import com.subscriptionmanager.dto.SubscriptionUpdateDTO;
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
import static org.junit.jupiter.api.Assertions.assertNull;
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
    void createBuildsAndLinksAServiceWithTheRequestedPlatform() {
        SubscriptionService service = newService();

        Client client = new Client(1L, "John", "Doe", "john@doe.com", "+11234567890");
        when(clientRepository.findById(1L)).thenReturn(Optional.of(client));
        when(platformRepository.findByName("MOBILE_BSCS9")).thenReturn(Optional.of(new Platform(1L, "MOBILE_BSCS9")));
        ArgumentCaptor<Subscription> captor = ArgumentCaptor.forClass(Subscription.class);
        when(subscriptionRepository.save(captor.capture())).thenAnswer(inv -> inv.getArgument(0));

        SubscriptionRequestDTO request = new SubscriptionRequestDTO();
        request.setClientId(1L);
        request.setPlatform("MOBILE_BSCS9");
        request.setContract("CONTR_001");
        request.setAmount(new BigDecimal("10.00"));

        service.create(request);

        Subscription saved = captor.getValue();
        assertEquals(saved, saved.getService().getSubscription());
        assertEquals("MOBILE_BSCS9", saved.getService().getPlatform());
        assertNull(saved.getService().getMsisdn());
        assertNull(saved.getService().getSimIccid());
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
        Subscription subscription = new Subscription(1L, client, "CONTR_001", status, LocalDate.now(), new BigDecimal("10.00"));
        com.subscriptionmanager.entity.Service service =
                new com.subscriptionmanager.entity.Service(subscription, "MOBILE_BSCS9", null, null);
        subscription.setService(service);
        return subscription;
    }

    @Test
    void returnsFullDetailWithAvailableActionsForExistingSubscription() {
        SubscriptionService service = newService();
        Subscription subscription = buildSubscription("AC");
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));
        when(actionRegistry.availableProductActionsFor("AC")).thenReturn(List.of("SUSPEND", "CANCEL"));
        when(actionRegistry.availableServiceActionsFor("AC")).thenReturn(List.of("CHANGE_PLAN", "CHANGE_MSISDN", "CHANGE_SIM"));

        SubscriptionDetailDTO detail = service.getById(1L);

        assertEquals("John Doe", detail.getClientName());
        assertEquals("AC", detail.getStatus());
        assertEquals(List.of("SUSPEND", "CANCEL"), detail.getAvailableProductActions());
        assertEquals(List.of("CHANGE_PLAN", "CHANGE_MSISDN", "CHANGE_SIM"), detail.getAvailableServiceActions());
        assertEquals("MOBILE_BSCS9", detail.getService().getPlatform());
        assertEquals(detail.getSubscriptionMsisdn(), detail.getService().getMsisdn());
        assertEquals(detail.getSimIccid(), detail.getService().getSimIccid());
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
        when(actionRegistry.availableProductActionsFor("CA")).thenReturn(List.of());
        when(actionRegistry.availableServiceActionsFor("CA")).thenReturn(List.of());

        SubscriptionDetailDTO detail = service.getById(1L);

        assertTrue(detail.getAvailableProductActions().isEmpty());
        assertTrue(detail.getAvailableServiceActions().isEmpty());
    }

    @Test
    void updatesContractAndAmount() {
        SubscriptionService service = newService();
        Subscription subscription = buildSubscription("AC");
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));
        when(subscriptionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        SubscriptionUpdateDTO request = new SubscriptionUpdateDTO();
        request.setContract("CONTR_002");
        request.setAmount(new BigDecimal("20.00"));

        SubscriptionDTO result = service.update(1L, request);

        assertEquals("CONTR_002", result.getContract());
        assertEquals(new BigDecimal("20.00"), result.getAmount());
        assertEquals("MOBILE_BSCS9", result.getPlatform());
    }

    @Test
    void throwsNotFoundForNonExistentSubscriptionOnUpdate() {
        SubscriptionService service = newService();
        when(subscriptionRepository.findById(999L)).thenReturn(Optional.empty());

        SubscriptionUpdateDTO request = new SubscriptionUpdateDTO();
        request.setContract("CONTR_002");
        request.setAmount(new BigDecimal("20.00"));

        assertThrows(SubscriptionNotFoundException.class, () -> service.update(999L, request));
    }
}
