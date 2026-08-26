package com.subscriptionmanager.entity;

import jakarta.persistence.*;

@Entity
@Table(schema = "SUBSCRIPTION_MANAGER", name = "RESOURCES")
public class Resource {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "seq_resource_id")
    @SequenceGenerator(name = "seq_resource_id", sequenceName = "SEQ_RESOURCE_ID", allocationSize = 1)
    @Column(name = "ID")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "SERVICE_ID", nullable = false)
    private com.subscriptionmanager.entity.Service service;

    @Column(name = "RESOURCE_TYPE")
    private String resourceType;

    @Column(name = "VALUE")
    private String value;

    public Resource() {
    }

    public Resource(com.subscriptionmanager.entity.Service service, String resourceType, String value) {
        this.service = service;
        this.resourceType = resourceType;
        this.value = value;
    }

    public Long getId() { return id; }
    public com.subscriptionmanager.entity.Service getService() { return service; }
    public String getResourceType() { return resourceType; }
    public String getValue() { return value; }

    public void setId(Long id) { this.id = id; }
    public void setService(com.subscriptionmanager.entity.Service service) { this.service = service; }
    public void setResourceType(String resourceType) { this.resourceType = resourceType; }
    public void setValue(String value) { this.value = value; }
}
