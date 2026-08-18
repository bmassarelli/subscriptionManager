package com.subscriptionmanager.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

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

    @Column(name = "PLATFORM")
    private String platform;

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

    @Column(name = "PO")
    private String po;

    @Column(name = "ACTIVATE_DATE")
    private LocalDate activateDate;

    @Column(name = "DEACTIVATE_DATE")
    private LocalDate deactivateDate;

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

    @Column(name = "MSISDN")
    private String msisdn;

    @Column(name = "SIM_ICCID")
    private String simIccid;

    public Subscription() {
    }

    public Subscription(Long id, Client client, String platform, String contract,
                         String status, LocalDate entryDate, BigDecimal amount) {
        this.id = id;
        this.client = client;
        this.platform = platform;
        this.contract = contract;
        this.status = status;
        this.entryDate = entryDate;
        this.amount = amount;
    }

    public Long getId() { return id; }
    public Client getClient() { return client; }
    public String getPlatform() { return platform; }
    public String getContract() { return contract; }
    public String getStatus() { return status; }
    public LocalDate getEntryDate() { return entryDate; }
    public BigDecimal getAmount() { return amount; }
    public LocalDate getModifyDate() { return modifyDate; }
    public String getPo() { return po; }
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
    public String getMsisdn() { return msisdn; }
    public String getSimIccid() { return simIccid; }

    public void setId(Long id) { this.id = id; }
    public void setClient(Client client) { this.client = client; }
    public void setPlatform(String platform) { this.platform = platform; }
    public void setContract(String contract) { this.contract = contract; }
    public void setStatus(String status) { this.status = status; }
    public void setEntryDate(LocalDate entryDate) { this.entryDate = entryDate; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public void setModifyDate(LocalDate modifyDate) { this.modifyDate = modifyDate; }
    public void setPo(String po) { this.po = po; }
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
    public void setMsisdn(String msisdn) { this.msisdn = msisdn; }
    public void setSimIccid(String simIccid) { this.simIccid = simIccid; }
}
