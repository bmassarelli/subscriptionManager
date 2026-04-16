package com.subscriptionmanager.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public class SubscriptionDTO {

    private Long id;
    private String clientName;
    private String email;
    private String msisdn;
    private String platform;
    private String contract;
    private String status;
    private LocalDate entryDate;
    private BigDecimal amount;

    public SubscriptionDTO(Long id, String clientName, String email, String msisdn,
                           String platform, String contract, String status,
                           LocalDate entryDate, BigDecimal amount) {
        this.id = id;
        this.clientName = clientName;
        this.email = email;
        this.msisdn = msisdn;
        this.platform = platform;
        this.contract = contract;
        this.status = status;
        this.entryDate = entryDate;
        this.amount = amount;
    }

    public Long getId() { return id; }
    public String getClientName() { return clientName; }
    public String getEmail() { return email; }
    public String getMsisdn() { return msisdn; }
    public String getPlatform() { return platform; }
    public String getContract() { return contract; }
    public String getStatus() { return status; }
    public LocalDate getEntryDate() { return entryDate; }
    public BigDecimal getAmount() { return amount; }
}
