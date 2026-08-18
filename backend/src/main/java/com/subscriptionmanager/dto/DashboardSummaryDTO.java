package com.subscriptionmanager.dto;

import java.util.List;
import java.util.Map;

public class DashboardSummaryDTO {

    private final long clientCount;
    private final long subscriptionCount;
    private final Map<String, Long> statusCounts;
    private final List<OperationDTO> recentOperations;
    private final Map<String, Long> operationTypeCounts;

    public DashboardSummaryDTO(long clientCount, long subscriptionCount, Map<String, Long> statusCounts,
                                List<OperationDTO> recentOperations, Map<String, Long> operationTypeCounts) {
        this.clientCount = clientCount;
        this.subscriptionCount = subscriptionCount;
        this.statusCounts = statusCounts;
        this.recentOperations = recentOperations;
        this.operationTypeCounts = operationTypeCounts;
    }

    public long getClientCount() { return clientCount; }
    public long getSubscriptionCount() { return subscriptionCount; }
    public Map<String, Long> getStatusCounts() { return statusCounts; }
    public List<OperationDTO> getRecentOperations() { return recentOperations; }
    public Map<String, Long> getOperationTypeCounts() { return operationTypeCounts; }
}
