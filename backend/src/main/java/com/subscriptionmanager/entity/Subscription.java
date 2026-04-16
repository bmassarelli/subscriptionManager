package com.subscriptionmanager.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(schema = "SUBSCRIBER_MANAGER", name = "SUBSCRIPTIONS")
public class Subscription {

    @Id
    @Column(name = "ID")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "CLIENT_ID")
    private Client client;

    @Column(name = "PLATFORM")
    private String platform;

    @Column(name = "CONTRACT")
    private String contract;

    @Column(name = "STATUS")
    private String status;

    @Column(name = "ENTRY_DATE")
    private LocalDate entryDate;

    @Column(name = "AMOUNT")
    private BigDecimal amount;

    public Long getId() { return id; }
    public Client getClient() { return client; }
    public String getPlatform() { return platform; }
    public String getContract() { return contract; }
    public String getStatus() { return status; }
    public LocalDate getEntryDate() { return entryDate; }
    public BigDecimal getAmount() { return amount; }
}
