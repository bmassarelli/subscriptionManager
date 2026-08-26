package com.subscriptionmanager.entity;

import jakarta.persistence.*;

/**
 * {@code Service} (TMF638) — the technical-realization attributes of a {@code Subscription}:
 * access + billing engine (platform), MSISDN, SIM ICCID. One-to-one with {@code Subscription}.
 * See {@code Subscription}'s class Javadoc for the {@code platform} vs {@code productOffering}
 * distinction that motivated pulling these fields out into their own table/entity.
 */
@Entity
@Table(schema = "SUBSCRIPTION_MANAGER", name = "SERVICE")
public class Service {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "seq_service_id")
    @SequenceGenerator(name = "seq_service_id", sequenceName = "SEQ_SERVICE_ID", allocationSize = 1)
    @Column(name = "ID")
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "SUBSCRIPTION_ID", unique = true, nullable = false)
    private Subscription subscription;

    @Column(name = "PLATFORM")
    private String platform;

    @Column(name = "MSISDN")
    private String msisdn;

    // Kept as a dedicated field rather than a generic RESOURCE_TYPE='SIM' row — moving it would
    // drop the audit trail CHANGE_SIM gets via Operation records (RESOURCES assignment is plain
    // CRUD, not audited), lose ChangeSimAction's non-blank validation, and create an asymmetry
    // with MSISDN, which stays a dedicated field regardless. See
    // openspec/changes/archive/2026-08-26-evaluate-sim-iccid-as-resource for the full evaluation.
    @Column(name = "SIM_ICCID")
    private String simIccid;

    public Service() {
    }

    public Service(Subscription subscription, String platform, String msisdn, String simIccid) {
        this.subscription = subscription;
        this.platform = platform;
        this.msisdn = msisdn;
        this.simIccid = simIccid;
    }

    public Long getId() { return id; }
    public Subscription getSubscription() { return subscription; }
    public String getPlatform() { return platform; }
    public String getMsisdn() { return msisdn; }
    public String getSimIccid() { return simIccid; }

    public void setId(Long id) { this.id = id; }
    public void setSubscription(Subscription subscription) { this.subscription = subscription; }
    public void setPlatform(String platform) { this.platform = platform; }
    public void setMsisdn(String msisdn) { this.msisdn = msisdn; }
    public void setSimIccid(String simIccid) { this.simIccid = simIccid; }
}
