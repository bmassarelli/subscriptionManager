package com.subscriptionmanager.dto;

public class ServiceDTO {

    private final String platform;
    private final String msisdn;
    private final String simIccid;

    public ServiceDTO(String platform, String msisdn, String simIccid) {
        this.platform = platform;
        this.msisdn = msisdn;
        this.simIccid = simIccid;
    }

    public String getPlatform() { return platform; }
    public String getMsisdn() { return msisdn; }
    public String getSimIccid() { return simIccid; }
}
