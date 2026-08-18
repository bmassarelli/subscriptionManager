package com.subscriptionmanager.service;

public class InvalidPaymentModeException extends RuntimeException {

    public InvalidPaymentModeException(String message) {
        super(message);
    }
}
