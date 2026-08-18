package com.subscriptionmanager.dto;

public class LifecycleActionResultDTO {

    private final SubscriptionDTO subscription;
    private final OperationDTO operation;

    public LifecycleActionResultDTO(SubscriptionDTO subscription, OperationDTO operation) {
        this.subscription = subscription;
        this.operation = operation;
    }

    public SubscriptionDTO getSubscription() { return subscription; }
    public OperationDTO getOperation() { return operation; }
}
