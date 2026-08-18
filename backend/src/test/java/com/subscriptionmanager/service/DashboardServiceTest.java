package com.subscriptionmanager.service;

import com.subscriptionmanager.dto.DashboardSummaryDTO;
import com.subscriptionmanager.entity.Client;
import com.subscriptionmanager.entity.Operation;
import com.subscriptionmanager.entity.Subscription;
import com.subscriptionmanager.repository.ClientRepository;
import com.subscriptionmanager.repository.OperationRepository;
import com.subscriptionmanager.repository.SubscriptionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DashboardServiceTest {

    @Mock
    private ClientRepository clientRepository;

    @Mock
    private SubscriptionRepository subscriptionRepository;

    @Mock
    private OperationRepository operationRepository;

    private DashboardService service;

    @BeforeEach
    void setUp() {
        service = new DashboardService(clientRepository, subscriptionRepository, operationRepository);
    }

    @Test
    void returnsAccurateCountsWithAllSixStatusesPresent() {
        when(clientRepository.count()).thenReturn(5L);
        when(subscriptionRepository.count()).thenReturn(8L);
        when(subscriptionRepository.countByStatus()).thenReturn(List.of(
                new Object[]{"AC", 3L},
                new Object[]{"SU", 2L}
        ));
        when(operationRepository.findAllByOrderByCreatedDateDesc(org.mockito.ArgumentMatchers.any(Pageable.class)))
                .thenReturn(List.of());
        when(operationRepository.countByOperationType()).thenReturn(List.of(
                new Object[]{"SUSPEND", 2L},
                new Object[]{"CREATE", 6L}
        ));

        DashboardSummaryDTO summary = service.getSummary();

        assertEquals(5L, summary.getClientCount());
        assertEquals(8L, summary.getSubscriptionCount());
        assertEquals(6, summary.getStatusCounts().size());
        assertEquals(3L, summary.getStatusCounts().get("AC"));
        assertEquals(2L, summary.getStatusCounts().get("SU"));
        assertEquals(0L, summary.getStatusCounts().get("TR"));
        assertEquals(0L, summary.getStatusCounts().get("EX"));
        assertEquals(0L, summary.getStatusCounts().get("CA"));
        assertEquals(0L, summary.getStatusCounts().get("ER"));
        assertEquals(2L, summary.getOperationTypeCounts().get("SUSPEND"));
        assertEquals(6L, summary.getOperationTypeCounts().get("CREATE"));
    }

    @Test
    void returnsAllZeroFiguresAndEmptyRecentOperationsWhenNoDataExists() {
        when(clientRepository.count()).thenReturn(0L);
        when(subscriptionRepository.count()).thenReturn(0L);
        when(subscriptionRepository.countByStatus()).thenReturn(List.of());
        when(operationRepository.findAllByOrderByCreatedDateDesc(org.mockito.ArgumentMatchers.any(Pageable.class)))
                .thenReturn(List.of());
        when(operationRepository.countByOperationType()).thenReturn(List.of());

        DashboardSummaryDTO summary = service.getSummary();

        assertEquals(0L, summary.getClientCount());
        assertEquals(0L, summary.getSubscriptionCount());
        assertEquals(6, summary.getStatusCounts().size());
        summary.getStatusCounts().values().forEach(count -> assertEquals(0L, count));
        assertTrue(summary.getRecentOperations().isEmpty());
        assertTrue(summary.getOperationTypeCounts().isEmpty());
    }

    @Test
    void requestsRecentOperationsCappedAtTheFixedLimitMostRecentFirst() {
        when(clientRepository.count()).thenReturn(1L);
        when(subscriptionRepository.count()).thenReturn(1L);
        when(subscriptionRepository.countByStatus()).thenReturn(List.of());

        Client client = new Client(1L, "John", "Doe", "john@doe.com", "+11234567890");
        Subscription subscription = new Subscription(1L, client, "MOBILE_BSCS9", "CONTR_001", "AC",
                LocalDate.now(), new BigDecimal("10.00"));
        LocalDateTime now = LocalDateTime.now();
        Operation newest = new Operation(subscription, "SUSPEND", "COMPLETED", now, now, null, "AC -> SU", null);

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        when(operationRepository.findAllByOrderByCreatedDateDesc(pageableCaptor.capture()))
                .thenReturn(List.of(newest));
        when(operationRepository.countByOperationType()).thenReturn(List.of());

        DashboardSummaryDTO summary = service.getSummary();

        assertEquals(1, summary.getRecentOperations().size());
        assertEquals("SUSPEND", summary.getRecentOperations().get(0).getOperationType());
        assertEquals(PageRequest.of(0, 10), pageableCaptor.getValue());
    }
}
