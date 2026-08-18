package com.subscriptionmanager.dto;

public class ClientResponseDTO {

    private final Long clientId;
    private final String name;
    private final String lastName;
    private final String email;
    private final String msisdn;

    public ClientResponseDTO(Long clientId, String name, String lastName, String email, String msisdn) {
        this.clientId = clientId;
        this.name = name;
        this.lastName = lastName;
        this.email = email;
        this.msisdn = msisdn;
    }

    public Long getClientId() { return clientId; }
    public String getName() { return name; }
    public String getLastName() { return lastName; }
    public String getEmail() { return email; }
    public String getMsisdn() { return msisdn; }
}
