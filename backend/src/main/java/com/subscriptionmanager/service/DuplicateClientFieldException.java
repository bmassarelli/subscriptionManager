package com.subscriptionmanager.service;

public class DuplicateClientFieldException extends RuntimeException {

    private final String field;

    public DuplicateClientFieldException(String field, String message) {
        super(message);
        this.field = field;
    }

    public String getField() { return field; }
}
