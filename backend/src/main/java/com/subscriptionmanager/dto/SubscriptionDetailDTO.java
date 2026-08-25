package com.subscriptionmanager.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public class SubscriptionDetailDTO {

    private final Long id;
    private final String clientName;
    private final String email;
    private final String msisdn;
    private final String platform;
    private final String contract;
    private final String po;
    private final String paymentModeName;
    private final String status;
    private final LocalDate entryDate;
    private final LocalDate activateDate;
    private final LocalDate deactivateDate;
    private final LocalDate cancelDate;
    private final LocalDate startTrialDate;
    private final LocalDate endTrialDate;
    private final BigDecimal amount;
    private final String subscriptionMsisdn;
    private final String simIccid;
    private final ServiceDTO service;
    private final List<String> availableActions;

    public SubscriptionDetailDTO(Long id, String clientName, String email, String msisdn,
                                  String platform, String contract, String po, String paymentModeName,
                                  String status, LocalDate entryDate, LocalDate activateDate,
                                  LocalDate deactivateDate, LocalDate cancelDate, LocalDate startTrialDate,
                                  LocalDate endTrialDate, BigDecimal amount, String subscriptionMsisdn,
                                  String simIccid, ServiceDTO service, List<String> availableActions) {
        this.id = id;
        this.clientName = clientName;
        this.email = email;
        this.msisdn = msisdn;
        this.platform = platform;
        this.contract = contract;
        this.po = po;
        this.paymentModeName = paymentModeName;
        this.status = status;
        this.entryDate = entryDate;
        this.activateDate = activateDate;
        this.deactivateDate = deactivateDate;
        this.cancelDate = cancelDate;
        this.startTrialDate = startTrialDate;
        this.endTrialDate = endTrialDate;
        this.amount = amount;
        this.subscriptionMsisdn = subscriptionMsisdn;
        this.simIccid = simIccid;
        this.service = service;
        this.availableActions = availableActions;
    }

    public Long getId() { return id; }
    public String getClientName() { return clientName; }
    public String getEmail() { return email; }
    public String getMsisdn() { return msisdn; }
    public String getPlatform() { return platform; }
    public String getContract() { return contract; }
    public String getPo() { return po; }
    public String getPaymentModeName() { return paymentModeName; }
    public String getStatus() { return status; }
    public LocalDate getEntryDate() { return entryDate; }
    public LocalDate getActivateDate() { return activateDate; }
    public LocalDate getDeactivateDate() { return deactivateDate; }
    public LocalDate getCancelDate() { return cancelDate; }
    public LocalDate getStartTrialDate() { return startTrialDate; }
    public LocalDate getEndTrialDate() { return endTrialDate; }
    public BigDecimal getAmount() { return amount; }
    public String getSubscriptionMsisdn() { return subscriptionMsisdn; }
    public String getSimIccid() { return simIccid; }
    public ServiceDTO getService() { return service; }
    public List<String> getAvailableActions() { return availableActions; }
}
