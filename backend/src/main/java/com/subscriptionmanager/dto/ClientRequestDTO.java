package com.subscriptionmanager.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public class ClientRequestDTO {

    @NotBlank(message = "name is required")
    private String name;

    @NotBlank(message = "lastName is required")
    private String lastName;

    @NotBlank(message = "email is required")
    @Email(message = "email must be a valid email address")
    private String email;

    @NotBlank(message = "msisdn is required")
    @Pattern(regexp = "^\\+?\\d{8,15}$", message = "msisdn must be a valid phone number")
    private String msisdn;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getLastName() { return lastName; }
    public void setLastName(String lastName) { this.lastName = lastName; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getMsisdn() { return msisdn; }
    public void setMsisdn(String msisdn) { this.msisdn = msisdn; }
}
