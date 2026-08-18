package com.subscriptionmanager.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.subscriptionmanager.entity.Operation;
import com.subscriptionmanager.entity.Subscription;
import com.subscriptionmanager.repository.OperationRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Map;

@Service
public class OperationRecorder {

    private final OperationRepository operationRepository;
    private final ObjectMapper objectMapper;

    public OperationRecorder(OperationRepository operationRepository, ObjectMapper objectMapper) {
        this.operationRepository = operationRepository;
        this.objectMapper = objectMapper;
    }

    public Operation record(Subscription subscription, String type, String status,
                             String errorMessage, String description, Map<String, Object> data) {
        LocalDateTime now = LocalDateTime.now();
        Operation operation = new Operation(subscription, type, status, now, now,
                errorMessage, description, serialize(data));
        return operationRepository.save(operation);
    }

    private String serialize(Map<String, Object> data) {
        if (data == null || data.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(data);
        } catch (JsonProcessingException e) {
            return data.toString();
        }
    }
}
