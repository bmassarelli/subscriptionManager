package com.subscriptionmanager.entity;

import jakarta.persistence.*;

@Entity
@Table(schema = "SUBSCRIPTION_MANAGER", name = "PAYMENT_MODE")
public class PaymentMode {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "ID")
    private Long id;

    @Column(name = "NAME")
    private String name;

    public PaymentMode() {
    }

    public PaymentMode(Long id, String name) {
        this.id = id;
        this.name = name;
    }

    public Long getId() { return id; }
    public String getName() { return name; }

    public void setId(Long id) { this.id = id; }
    public void setName(String name) { this.name = name; }
}
