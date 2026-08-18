package com.subscriptionmanager.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(schema = "SUBSCRIPTION_MANAGER", name = "OPERATIONS")
public class Operation {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "seq_operation_id")
    @SequenceGenerator(name = "seq_operation_id", sequenceName = "SEQ_OPERATION_ID", allocationSize = 1)
    @Column(name = "ID")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "SUBSCRIPTION_ID")
    private Subscription subscription;

    @Column(name = "OPERATION_TYPE")
    private String operationType;

    @Column(name = "STATUS")
    private String status;

    @Column(name = "CREATED_DATE")
    private LocalDateTime createdDate;

    @Column(name = "UPDATED_DATE")
    private LocalDateTime updatedDate;

    @Column(name = "ERROR_MESSAGE")
    private String errorMessage;

    @Column(name = "DESCRIPTION")
    private String description;

    @Column(name = "OPERATION_DATA")
    private String operationData;

    public Operation() {
    }

    public Operation(Subscription subscription, String operationType, String status,
                      LocalDateTime createdDate, LocalDateTime updatedDate,
                      String errorMessage, String description, String operationData) {
        this.subscription = subscription;
        this.operationType = operationType;
        this.status = status;
        this.createdDate = createdDate;
        this.updatedDate = updatedDate;
        this.errorMessage = errorMessage;
        this.description = description;
        this.operationData = operationData;
    }

    public Long getId() { return id; }
    public Subscription getSubscription() { return subscription; }
    public String getOperationType() { return operationType; }
    public String getStatus() { return status; }
    public LocalDateTime getCreatedDate() { return createdDate; }
    public LocalDateTime getUpdatedDate() { return updatedDate; }
    public String getErrorMessage() { return errorMessage; }
    public String getDescription() { return description; }
    public String getOperationData() { return operationData; }

    public void setId(Long id) { this.id = id; }
    public void setSubscription(Subscription subscription) { this.subscription = subscription; }
    public void setOperationType(String operationType) { this.operationType = operationType; }
    public void setStatus(String status) { this.status = status; }
    public void setCreatedDate(LocalDateTime createdDate) { this.createdDate = createdDate; }
    public void setUpdatedDate(LocalDateTime updatedDate) { this.updatedDate = updatedDate; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    public void setDescription(String description) { this.description = description; }
    public void setOperationData(String operationData) { this.operationData = operationData; }
}
