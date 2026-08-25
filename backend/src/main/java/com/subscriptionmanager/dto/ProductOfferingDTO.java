package com.subscriptionmanager.dto;

public class ProductOfferingDTO {

    private final Long id;
    private final String name;

    public ProductOfferingDTO(Long id, String name) {
        this.id = id;
        this.name = name;
    }

    public Long getId() { return id; }
    public String getName() { return name; }
}
