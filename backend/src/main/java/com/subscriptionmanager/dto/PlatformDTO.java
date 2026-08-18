package com.subscriptionmanager.dto;

public class PlatformDTO {

    private final Long id;
    private final String name;

    public PlatformDTO(Long id, String name) {
        this.id = id;
        this.name = name;
    }

    public Long getId() { return id; }
    public String getName() { return name; }
}
