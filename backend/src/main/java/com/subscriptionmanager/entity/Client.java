package com.subscriptionmanager.entity;

import jakarta.persistence.*;

@Entity
@Table(schema = "SUBSCRIBER_MANAGER", name = "CLIENT")
public class Client {

    @Id
    @Column(name = "CLIENT_ID")
    private Long clientId;

    @Column(name = "NAME")
    private String name;

    @Column(name = "LAST_NAME")
    private String lastName;

    @Column(name = "EMAIL")
    private String email;

    @Column(name = "MSISDN")
    private String msisdn;

    public Long getClientId() { return clientId; }
    public String getName() { return name; }
    public String getLastName() { return lastName; }
    public String getEmail() { return email; }
    public String getMsisdn() { return msisdn; }
}
