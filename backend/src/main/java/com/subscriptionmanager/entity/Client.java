package com.subscriptionmanager.entity;

import jakarta.persistence.*;

@Entity
@Table(schema = "SUBSCRIPTION_MANAGER", name = "CLIENT")
public class Client {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "seq_client_id")
    @SequenceGenerator(name = "seq_client_id", sequenceName = "SEQ_CLIENT_ID", allocationSize = 1)
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

    public Client() {
    }

    public Client(Long clientId, String name, String lastName, String email, String msisdn) {
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

    public void setClientId(Long clientId) { this.clientId = clientId; }
    public void setName(String name) { this.name = name; }
    public void setLastName(String lastName) { this.lastName = lastName; }
    public void setEmail(String email) { this.email = email; }
    public void setMsisdn(String msisdn) { this.msisdn = msisdn; }
}
