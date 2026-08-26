package com.subscriptionmanager.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * {@code productOffering} and {@code platform} are two distinct, non-overlapping TM Forum
 * concepts, not redundant fields:
 * <ul>
 *   <li>{@code productOffering} ({@code po} on the wire) is the commercial
 *       {@code ProductOffering} (TMF620) — <em>what</em> the client bought (e.g. {@code claroVideo}).</li>
 *   <li>{@code platform} is a {@code Service} (TMF638) technical-realization attribute — access
 *       + billing engine (e.g. {@code MOBILE_BSCS9}) — <em>how</em> the offering is technically
 *       provisioned and billed.</li>
 * </ul>
 * Do not conflate them: an earlier draft of the TM Forum alignment analysis
 * ({@code docs/superpowers/specs/2026-08-20-tmforum-alignment-analysis.md}, §0.2) mistook
 * {@code platform} for the {@code ProductOffering} precisely because it is validated, mandatory,
 * and mutable — the external contract ({@code POST /subsmanActivate} sending {@code platform} and
 * {@code po} as distinct, coexisting fields) proves they are independent axes.
 */
@Entity
@Table(schema = "SUBSCRIPTION_MANAGER", name = "SUBSCRIPTIONS")
public class Subscription {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "seq_subscription_id")
    @SequenceGenerator(name = "seq_subscription_id", sequenceName = "SEQ_SUBSCRIPTION_ID", allocationSize = 1)
    @Column(name = "ID")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "CLIENT_ID")
    private Client client;

    @Column(name = "CONTRACT")
    private String contract;

    @Column(name = "STATUS")
    private String status;

    @Column(name = "ENTRY_DATE")
    private LocalDate entryDate;

    @Column(name = "AMOUNT")
    private BigDecimal amount;

    @Column(name = "MODIFY_DATE")
    private LocalDate modifyDate;

    // Commercial ProductOffering (TMF620) — WHAT the client bought.
    // Not the technical-realization attribute — see class Javadoc.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "PRODUCT_OFFERING_ID")
    private ProductOffering productOffering;

    @Column(name = "ACTIVATE_DATE")
    private LocalDate activateDate;

    // Set by CancelAction only, and only when immediate=true; null otherwise, with no other
    // local writer. See subscription-lifecycle's "Cancel action" requirement.
    @Column(name = "DEACTIVATE_DATE")
    private LocalDate deactivateDate;

    // Set by CancelAction unconditionally on every CANCEL; no other local writer.
    // See subscription-lifecycle's "Cancel action" requirement.
    @Column(name = "CANCEL_DATE")
    private LocalDate cancelDate;

    @Column(name = "START_TRIAL_DATE")
    private LocalDate startTrialDate;

    @Column(name = "END_TRIAL_DATE")
    private LocalDate endTrialDate;

    @Column(name = "TRANSACTION_DATE")
    private LocalDate transactionDate;

    @Column(name = "FLOW")
    private String flow;

    @Column(name = "OBSERVATION")
    private String observation;

    @Column(name = "ERROR_CODE")
    private String errorCode;

    @Column(name = "ERROR_MSG")
    private String errorMsg;

    @Column(name = "PROMOTION")
    private Long promotion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "PAYMENT_MODE_ID")
    private PaymentMode paymentMode;

    @Column(name = "PRE_SUSPEND_STATUS")
    private String preSuspendStatus;

    // Service (TMF638) — technical-realization attributes (platform/msisdn/simIccid), owned by
    // its own table/entity. See Service's class Javadoc for the platform vs productOffering
    // distinction. Referenced fully-qualified (no import) for naming-collision consistency with
    // @Service-annotated files, per convention — see SubscriptionService.java.
    // NOTE: fetch = LAZY is not truly lazy here — this project has no bytecode enhancement
    // configured, so Hibernate cannot build a lazy proxy for the non-owning side of a @OneToOne
    // and loads `service` eagerly on every Subscription fetch regardless of this hint. That is
    // what keeps getById()/update()/lifecycle actions correct without an explicit JOIN FETCH —
    // do not "fix" the extra SELECT by adding bytecode enhancement without accounting for that.
    @OneToOne(mappedBy = "subscription", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private com.subscriptionmanager.entity.Service service;

    public Subscription() {
    }

    public Subscription(Long id, Client client, String contract,
                         String status, LocalDate entryDate, BigDecimal amount) {
        this.id = id;
        this.client = client;
        this.contract = contract;
        this.status = status;
        this.entryDate = entryDate;
        this.amount = amount;
    }

    public Long getId() { return id; }
    public Client getClient() { return client; }
    public com.subscriptionmanager.entity.Service getService() { return service; }
    public String getContract() { return contract; }
    public String getStatus() { return status; }
    public LocalDate getEntryDate() { return entryDate; }
    public BigDecimal getAmount() { return amount; }
    public LocalDate getModifyDate() { return modifyDate; }
    public ProductOffering getProductOffering() { return productOffering; }
    public LocalDate getActivateDate() { return activateDate; }
    public LocalDate getDeactivateDate() { return deactivateDate; }
    public LocalDate getCancelDate() { return cancelDate; }
    public LocalDate getStartTrialDate() { return startTrialDate; }
    public LocalDate getEndTrialDate() { return endTrialDate; }
    public LocalDate getTransactionDate() { return transactionDate; }
    public String getFlow() { return flow; }
    public String getObservation() { return observation; }
    public String getErrorCode() { return errorCode; }
    public String getErrorMsg() { return errorMsg; }
    public Long getPromotion() { return promotion; }
    public PaymentMode getPaymentMode() { return paymentMode; }
    public String getPreSuspendStatus() { return preSuspendStatus; }

    public void setId(Long id) { this.id = id; }
    public void setClient(Client client) { this.client = client; }
    public void setService(com.subscriptionmanager.entity.Service service) { this.service = service; }
    public void setContract(String contract) { this.contract = contract; }
    public void setStatus(String status) { this.status = status; }
    public void setEntryDate(LocalDate entryDate) { this.entryDate = entryDate; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public void setModifyDate(LocalDate modifyDate) { this.modifyDate = modifyDate; }
    public void setProductOffering(ProductOffering productOffering) { this.productOffering = productOffering; }
    public void setActivateDate(LocalDate activateDate) { this.activateDate = activateDate; }
    public void setDeactivateDate(LocalDate deactivateDate) { this.deactivateDate = deactivateDate; }
    public void setCancelDate(LocalDate cancelDate) { this.cancelDate = cancelDate; }
    public void setStartTrialDate(LocalDate startTrialDate) { this.startTrialDate = startTrialDate; }
    public void setEndTrialDate(LocalDate endTrialDate) { this.endTrialDate = endTrialDate; }
    public void setTransactionDate(LocalDate transactionDate) { this.transactionDate = transactionDate; }
    public void setFlow(String flow) { this.flow = flow; }
    public void setObservation(String observation) { this.observation = observation; }
    public void setErrorCode(String errorCode) { this.errorCode = errorCode; }
    public void setErrorMsg(String errorMsg) { this.errorMsg = errorMsg; }
    public void setPromotion(Long promotion) { this.promotion = promotion; }
    public void setPaymentMode(PaymentMode paymentMode) { this.paymentMode = paymentMode; }
    public void setPreSuspendStatus(String preSuspendStatus) { this.preSuspendStatus = preSuspendStatus; }
}
