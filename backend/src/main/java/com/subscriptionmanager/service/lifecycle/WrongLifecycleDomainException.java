package com.subscriptionmanager.service.lifecycle;

public class WrongLifecycleDomainException extends RuntimeException {

    public WrongLifecycleDomainException(String message) {
        super(message);
    }
}
