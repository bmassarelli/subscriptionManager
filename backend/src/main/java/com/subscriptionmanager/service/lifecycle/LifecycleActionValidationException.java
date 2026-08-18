package com.subscriptionmanager.service.lifecycle;

public class LifecycleActionValidationException extends RuntimeException {

    private final String field;

    public LifecycleActionValidationException(String field, String message) {
        super(message);
        this.field = field;
    }

    public String getField() { return field; }
}
