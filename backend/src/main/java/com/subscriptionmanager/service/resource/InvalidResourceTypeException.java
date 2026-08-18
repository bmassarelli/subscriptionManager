package com.subscriptionmanager.service.resource;

public class InvalidResourceTypeException extends RuntimeException {
    public InvalidResourceTypeException(String message) {
        super(message);
    }
}
