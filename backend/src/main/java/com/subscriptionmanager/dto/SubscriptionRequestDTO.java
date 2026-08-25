package com.subscriptionmanager.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;

public class SubscriptionRequestDTO {

    @NotNull(message = "clientId is required")
    private Long clientId;

    @NotBlank(message = "platform is required")
    private String platform;

    @NotBlank(message = "contract is required")
    private String contract;

    @NotNull(message = "amount is required")
    @Positive(message = "amount must be positive")
    private BigDecimal amount;

    private Long paymentModeId;

    private String po;

    public Long getClientId() { return clientId; }
    public void setClientId(Long clientId) { this.clientId = clientId; }

    public String getPlatform() { return platform; }
    public void setPlatform(String platform) { this.platform = platform; }

    public String getContract() { return contract; }
    public void setContract(String contract) { this.contract = contract; }

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }

    public Long getPaymentModeId() { return paymentModeId; }
    public void setPaymentModeId(Long paymentModeId) { this.paymentModeId = paymentModeId; }

    public String getPo() { return po; }
    public void setPo(String po) { this.po = po; }
}
