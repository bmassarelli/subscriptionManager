package com.subscriptionmanager.service;

import com.subscriptionmanager.dto.DashboardSummaryDTO;
import com.subscriptionmanager.dto.OperationDTO;
import com.subscriptionmanager.repository.ClientRepository;
import com.subscriptionmanager.repository.OperationRepository;
import com.subscriptionmanager.repository.SubscriptionRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class DashboardService {

    private static final List<String> ALL_STATUSES = List.of("AC", "TR", "SU", "EX", "CA", "ER");
    private static final int RECENT_OPERATIONS_LIMIT = 10;

    private final ClientRepository clientRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final OperationRepository operationRepository;

    public DashboardService(ClientRepository clientRepository,
                             SubscriptionRepository subscriptionRepository,
                             OperationRepository operationRepository) {
        this.clientRepository = clientRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.operationRepository = operationRepository;
    }

    public DashboardSummaryDTO getSummary() {
        long clientCount = clientRepository.count();
        long subscriptionCount = subscriptionRepository.count();

        Map<String, Long> statusCounts = new LinkedHashMap<>();
        ALL_STATUSES.forEach(status -> statusCounts.put(status, 0L));
        for (Object[] row : subscriptionRepository.countByStatus()) {
            statusCounts.put((String) row[0], (Long) row[1]);
        }

        List<OperationDTO> recentOperations = operationRepository
                .findAllByOrderByCreatedDateDesc(PageRequest.of(0, RECENT_OPERATIONS_LIMIT))
                .stream()
                .map(OperationMapper::toDTO)
                .collect(Collectors.toList());

        Map<String, Long> operationTypeCounts = new LinkedHashMap<>();
        for (Object[] row : operationRepository.countByOperationType()) {
            operationTypeCounts.put((String) row[0], (Long) row[1]);
        }

        return new DashboardSummaryDTO(clientCount, subscriptionCount, statusCounts,
                recentOperations, operationTypeCounts);
    }
}
