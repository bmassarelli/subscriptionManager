package com.subscriptionmanager.dto;

import java.time.LocalDateTime;

public class OperationDTO {

    private final Long id;
    private final Long subscriptionId;
    private final String clientName;
    private final String operationType;
    private final String status;
    private final LocalDateTime createdDate;
    private final LocalDateTime updatedDate;
    private final String errorMessage;
    private final String description;

    public OperationDTO(Long id, Long subscriptionId, String clientName, String operationType,
                         String status, LocalDateTime createdDate, LocalDateTime updatedDate,
                         String errorMessage, String description) {
        this.id = id;
        this.subscriptionId = subscriptionId;
        this.clientName = clientName;
        this.operationType = operationType;
        this.status = status;
        this.createdDate = createdDate;
        this.updatedDate = updatedDate;
        this.errorMessage = errorMessage;
        this.description = description;
    }

    public Long getId() { return id; }
    public Long getSubscriptionId() { return subscriptionId; }
    public String getClientName() { return clientName; }
    public String getOperationType() { return operationType; }
    public String getStatus() { return status; }
    public LocalDateTime getCreatedDate() { return createdDate; }
    public LocalDateTime getUpdatedDate() { return updatedDate; }
    public String getErrorMessage() { return errorMessage; }
    public String getDescription() { return description; }
}
