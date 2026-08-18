package com.subscriptionmanager.service.lifecycle;

public class SubscriptionNotFoundException extends RuntimeException {

    public SubscriptionNotFoundException(String message) {
        super(message);
    }
}
