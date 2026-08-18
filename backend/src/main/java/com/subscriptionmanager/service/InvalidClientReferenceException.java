package com.subscriptionmanager.service;

public class InvalidClientReferenceException extends RuntimeException {

    public InvalidClientReferenceException(String message) {
        super(message);
    }
}
