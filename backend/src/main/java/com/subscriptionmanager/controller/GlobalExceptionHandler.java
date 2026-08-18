package com.subscriptionmanager.controller;

import com.subscriptionmanager.service.DuplicateClientFieldException;
import com.subscriptionmanager.service.InvalidClientReferenceException;
import com.subscriptionmanager.service.InvalidPaymentModeException;
import com.subscriptionmanager.service.InvalidPlatformException;
import com.subscriptionmanager.service.lifecycle.InvalidLifecycleTransitionException;
import com.subscriptionmanager.service.lifecycle.LifecycleActionValidationException;
import com.subscriptionmanager.service.lifecycle.SubscriptionNotFoundException;
import com.subscriptionmanager.service.lifecycle.UnknownLifecycleActionException;
import com.subscriptionmanager.service.resource.InvalidResourceTypeException;
import com.subscriptionmanager.service.resource.ResourceNotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> errors = new HashMap<>();
        for (FieldError fieldError : ex.getBindingResult().getFieldErrors()) {
            errors.put(fieldError.getField(), fieldError.getDefaultMessage());
        }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(errors);
    }

    @ExceptionHandler(InvalidClientReferenceException.class)
    public ResponseEntity<Map<String, String>> handleInvalidClientReference(InvalidClientReferenceException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("clientId", ex.getMessage()));
    }

    @ExceptionHandler(InvalidPlatformException.class)
    public ResponseEntity<Map<String, String>> handleInvalidPlatform(InvalidPlatformException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("platform", ex.getMessage()));
    }

    @ExceptionHandler(InvalidPaymentModeException.class)
    public ResponseEntity<Map<String, String>> handleInvalidPaymentMode(InvalidPaymentModeException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("paymentModeId", ex.getMessage()));
    }

    @ExceptionHandler(DuplicateClientFieldException.class)
    public ResponseEntity<Map<String, String>> handleDuplicateClientField(DuplicateClientFieldException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(ex.getField(), ex.getMessage()));
    }

    @ExceptionHandler(SubscriptionNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleSubscriptionNotFound(SubscriptionNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("id", ex.getMessage()));
    }

    @ExceptionHandler(UnknownLifecycleActionException.class)
    public ResponseEntity<Map<String, String>> handleUnknownLifecycleAction(UnknownLifecycleActionException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("type", ex.getMessage()));
    }

    @ExceptionHandler(InvalidLifecycleTransitionException.class)
    public ResponseEntity<Map<String, String>> handleInvalidLifecycleTransition(InvalidLifecycleTransitionException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("status", ex.getMessage()));
    }

    @ExceptionHandler(LifecycleActionValidationException.class)
    public ResponseEntity<Map<String, String>> handleLifecycleActionValidation(LifecycleActionValidationException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(ex.getField(), ex.getMessage()));
    }

    @ExceptionHandler(InvalidResourceTypeException.class)
    public ResponseEntity<Map<String, String>> handleInvalidResourceType(InvalidResourceTypeException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("resourceType", ex.getMessage()));
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleResourceNotFound(ResourceNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("resourceId", ex.getMessage()));
    }
}
