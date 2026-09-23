package com.subscriptionmanager.entity;

import jakarta.persistence.*;

@Entity
@Table(schema = "SUBSCRIPTION_MANAGER", name = "PRODUCT_OFFERING")
public class ProductOffering {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "ID")
    private Long id;

    @Column(name = "NAME")
    private String name;

    public ProductOffering() {
    }

    public ProductOffering(Long id, String name) {
        this.id = id;
        this.name = name;
    }

    public Long getId() { return id; }
    public String getName() { return name; }

    public void setId(Long id) { this.id = id; }
    public void setName(String name) { this.name = name; }
}
