package com.subscriptionmanager.model;

public record Subscription(
    Long id,
    String clientName,
    String email,
    String msisdn,
    String platform,
    String contract,
    String status,
    String entryDate,
    Double amount
) {}
