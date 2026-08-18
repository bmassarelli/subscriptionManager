package com.subscriptionmanager.service.lifecycle;

public class InvalidLifecycleTransitionException extends RuntimeException {

    public InvalidLifecycleTransitionException(String message) {
        super(message);
    }
}
