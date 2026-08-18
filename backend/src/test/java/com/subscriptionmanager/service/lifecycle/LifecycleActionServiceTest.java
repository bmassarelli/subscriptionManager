package com.subscriptionmanager.service.lifecycle;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.subscriptionmanager.dto.OperationDTO;
import com.subscriptionmanager.entity.Client;
import com.subscriptionmanager.entity.Operation;
import com.subscriptionmanager.entity.Platform;
import com.subscriptionmanager.entity.Subscription;
import com.subscriptionmanager.repository.OperationRepository;
import com.subscriptionmanager.repository.PlatformRepository;
import com.subscriptionmanager.repository.SubscriptionRepository;
import com.subscriptionmanager.service.OperationRecorder;
import com.subscriptionmanager.service.SubscriptionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class LifecycleActionServiceTest {

    @Mock private SubscriptionRepository subscriptionRepository;
    @Mock private OperationRepository operationRepository;
    @Mock private SubscriptionService subscriptionService;
    @Mock private PlatformRepository platformRepository;

    private LifecycleActionService service;

    @BeforeEach
    void setUp() {
        List<LifecycleAction> actions = List.of(
                new SuspendAction(),
                new ReconnectAction(),
                new CancelAction(),
                new ChangePlanAction(platformRepository),
                new ChangeMsisdnAction(),
                new ChangeSimAction()
        );
        LifecycleActionRegistry registry = new LifecycleActionRegistry(actions);
        OperationRecorder operationRecorder = new OperationRecorder(operationRepository, new ObjectMapper());
        service = new LifecycleActionService(subscriptionRepository, operationRepository, operationRecorder,
                subscriptionService, registry);

        lenient().when(subscriptionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(operationRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(subscriptionService.toDTO(any())).thenReturn(null);
    }

    private Subscription buildSubscription(String status) {
        Client client = new Client(1L, "John", "Doe", "john@doe.com", "+11234567890");
        return new Subscription(1L, client, "MOBILE_BSCS9", "CONTR_001", status, LocalDate.now(), new BigDecimal("10.00"));
    }

    @Test
    void suspendsActiveSubscription() {
        Subscription subscription = buildSubscription("AC");
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));

        service.execute(1L, "SUSPEND", Map.of());

        assertEquals("SU", subscription.getStatus());
        ArgumentCaptor<Operation> captor = ArgumentCaptor.forClass(Operation.class);
        verify(operationRepository).save(captor.capture());
        assertEquals("COMPLETED", captor.getValue().getStatus());
        assertEquals("AC -> SU", captor.getValue().getDescription());
    }

    @Test
    void rejectsSuspendOnIneligibleStatus() {
        Subscription subscription = buildSubscription("CA");
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));

        assertThrows(InvalidLifecycleTransitionException.class, () -> service.execute(1L, "SUSPEND", Map.of()));
        assertEquals("CA", subscription.getStatus());
        verify(operationRepository, never()).save(any());
    }

    @Test
    void reconnectsSuspendedSubscription() {
        Subscription subscription = buildSubscription("SU");
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));

        service.execute(1L, "RECONNECT", Map.of());

        assertEquals("AC", subscription.getStatus());
    }

    @Test
    void reconnectRestoresStatusFromBeforeSuspension() {
        Subscription subscription = buildSubscription("TR");
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));

        service.execute(1L, "SUSPEND", Map.of());
        assertEquals("SU", subscription.getStatus());
        assertEquals("TR", subscription.getPreSuspendStatus());

        service.execute(1L, "RECONNECT", Map.of());

        assertEquals("TR", subscription.getStatus());
        assertNull(subscription.getPreSuspendStatus());
    }

    @Test
    void rejectsReconnectOnIneligibleStatus() {
        Subscription subscription = buildSubscription("AC");
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));

        assertThrows(InvalidLifecycleTransitionException.class, () -> service.execute(1L, "RECONNECT", Map.of()));
    }

    @Test
    void recordsOperationDataAsValidJson() {
        Subscription subscription = buildSubscription("AC");
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));

        service.execute(1L, "CANCEL", Map.of("immediate", true));

        ArgumentCaptor<Operation> captor = ArgumentCaptor.forClass(Operation.class);
        verify(operationRepository).save(captor.capture());
        assertEquals("{\"immediate\":true}", captor.getValue().getOperationData());
    }

    @Test
    void cancelsImmediately() {
        Subscription subscription = buildSubscription("AC");
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));

        service.execute(1L, "CANCEL", Map.of("immediate", true));

        assertEquals("CA", subscription.getStatus());
        assertEquals(LocalDate.now(), subscription.getCancelDate());
        assertEquals(LocalDate.now(), subscription.getDeactivateDate());
    }

    @Test
    void cancelsNonImmediately() {
        Subscription subscription = buildSubscription("AC");
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));

        service.execute(1L, "CANCEL", Map.of("immediate", false));

        assertEquals("CA", subscription.getStatus());
        assertEquals(LocalDate.now(), subscription.getCancelDate());
        assertNull(subscription.getDeactivateDate());
    }

    @Test
    void rejectsCancelWithoutImmediateFlag() {
        Subscription subscription = buildSubscription("AC");
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));

        assertThrows(LifecycleActionValidationException.class, () -> service.execute(1L, "CANCEL", Map.of()));

        ArgumentCaptor<Operation> captor = ArgumentCaptor.forClass(Operation.class);
        verify(operationRepository).save(captor.capture());
        assertEquals("FAILED", captor.getValue().getStatus());
        assertEquals("AC", subscription.getStatus());
    }

    @Test
    void rejectsCancelOnTerminalStatus() {
        Subscription subscription = buildSubscription("EX");
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));

        assertThrows(InvalidLifecycleTransitionException.class,
                () -> service.execute(1L, "CANCEL", Map.of("immediate", true)));
    }

    @Test
    void changesPlanWithKnownPlatform() {
        Subscription subscription = buildSubscription("AC");
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));
        when(platformRepository.findByName("MOBILE_BSCS7")).thenReturn(Optional.of(new Platform(2L, "MOBILE_BSCS7")));

        service.execute(1L, "CHANGE_PLAN", Map.of("platform", "MOBILE_BSCS7"));

        assertEquals("MOBILE_BSCS7", subscription.getPlatform());
        assertEquals("AC", subscription.getStatus());
    }

    @Test
    void rejectsChangePlanWithUnknownPlatform() {
        Subscription subscription = buildSubscription("AC");
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));
        when(platformRepository.findByName("UNKNOWN")).thenReturn(Optional.empty());

        assertThrows(LifecycleActionValidationException.class,
                () -> service.execute(1L, "CHANGE_PLAN", Map.of("platform", "UNKNOWN")));
        assertEquals("MOBILE_BSCS9", subscription.getPlatform());
    }

    @Test
    void rejectsChangePlanOnIneligibleStatus() {
        Subscription subscription = buildSubscription("SU");
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));

        assertThrows(InvalidLifecycleTransitionException.class,
                () -> service.execute(1L, "CHANGE_PLAN", Map.of("platform", "MOBILE_BSCS7")));
    }

    @Test
    void changesMsisdnWithValidValue() {
        Subscription subscription = buildSubscription("AC");
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));

        service.execute(1L, "CHANGE_MSISDN", Map.of("msisdn", "+19998887777"));

        assertEquals("+19998887777", subscription.getMsisdn());
    }

    @Test
    void rejectsMalformedMsisdn() {
        Subscription subscription = buildSubscription("AC");
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));

        assertThrows(LifecycleActionValidationException.class,
                () -> service.execute(1L, "CHANGE_MSISDN", Map.of("msisdn", "abc")));
    }

    @Test
    void changesSimWithValidIdentifier() {
        Subscription subscription = buildSubscription("AC");
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));

        service.execute(1L, "CHANGE_SIM", Map.of("simIccid", "8944000000000000000"));

        assertEquals("8944000000000000000", subscription.getSimIccid());
    }

    @Test
    void rejectsMissingSimIdentifier() {
        Subscription subscription = buildSubscription("AC");
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));

        assertThrows(LifecycleActionValidationException.class, () -> service.execute(1L, "CHANGE_SIM", Map.of()));
    }

    @Test
    void rejectsUnknownActionType() {
        Subscription subscription = buildSubscription("AC");
        when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));

        assertThrows(UnknownLifecycleActionException.class, () -> service.execute(1L, "FOO", Map.of()));
        verify(operationRepository, never()).save(any());
    }

    @Test
    void rejectsUnknownSubscription() {
        when(subscriptionRepository.findById(999L)).thenReturn(Optional.empty());

        assertThrows(SubscriptionNotFoundException.class, () -> service.execute(999L, "SUSPEND", Map.of()));
    }

    @Test
    void listsOperationsMostRecentFirst() {
        Subscription subscription = buildSubscription("AC");
        LocalDateTime earlier = LocalDateTime.now().minusHours(1);
        LocalDateTime later = LocalDateTime.now();
        Operation older = new Operation(subscription, "CREATE", "COMPLETED", earlier, earlier, null, "Subscription created", null);
        Operation newer = new Operation(subscription, "SUSPEND", "COMPLETED", later, later, null, "AC -> SU", null);
        when(operationRepository.findBySubscriptionIdOrderByCreatedDateDesc(1L)).thenReturn(List.of(newer, older));

        List<OperationDTO> result = service.getOperations(1L);

        assertEquals(2, result.size());
        assertEquals("SUSPEND", result.get(0).getOperationType());
        assertEquals("CREATE", result.get(1).getOperationType());
    }

    @Test
    void listsEmptyOperationsWhenNoneRecorded() {
        when(operationRepository.findBySubscriptionIdOrderByCreatedDateDesc(1L)).thenReturn(List.of());
        assertTrue(service.getOperations(1L).isEmpty());
    }

    @Test
    void listsAllOperationsAcrossSubscriptionsMostRecentFirst() {
        Subscription subscriptionOne = buildSubscription("AC");
        Client otherClient = new Client(2L, "Jane", "Roe", "jane@roe.com", "+19998887777");
        Subscription subscriptionTwo = new Subscription(2L, otherClient, "FIXED_BSCS7", "CONTR_002",
                "SU", LocalDate.now(), new BigDecimal("5.00"));
        LocalDateTime earlier = LocalDateTime.now().minusHours(1);
        LocalDateTime later = LocalDateTime.now();
        Operation older = new Operation(subscriptionOne, "CREATE", "COMPLETED", earlier, earlier, null, "Subscription created", null);
        Operation newer = new Operation(subscriptionTwo, "SUSPEND", "COMPLETED", later, later, null, "AC -> SU", null);
        when(operationRepository.findAllByOrderByCreatedDateDesc()).thenReturn(List.of(newer, older));

        List<OperationDTO> result = service.getAllOperations();

        assertEquals(2, result.size());
        assertEquals("SUSPEND", result.get(0).getOperationType());
        assertEquals("Jane Roe", result.get(0).getClientName());
        assertEquals("CREATE", result.get(1).getOperationType());
    }

    @Test
    void listsAllOperationsEmptyWhenNoneRecorded() {
        when(operationRepository.findAllByOrderByCreatedDateDesc()).thenReturn(List.of());
        assertTrue(service.getAllOperations().isEmpty());
    }
}
