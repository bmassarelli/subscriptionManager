package com.subscriptionmanager.service;

import com.subscriptionmanager.dto.SubscriptionDTO;
import com.subscriptionmanager.dto.SubscriptionDetailDTO;
import com.subscriptionmanager.dto.SubscriptionRequestDTO;
import com.subscriptionmanager.entity.Client;
import com.subscriptionmanager.entity.PaymentMode;
import com.subscriptionmanager.entity.Subscription;
import com.subscriptionmanager.repository.ClientRepository;
import com.subscriptionmanager.repository.PaymentModeRepository;
import com.subscriptionmanager.repository.PlatformRepository;
import com.subscriptionmanager.repository.SubscriptionRepository;
import com.subscriptionmanager.service.lifecycle.LifecycleActionRegistry;
import com.subscriptionmanager.service.lifecycle.SubscriptionNotFoundException;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class SubscriptionService {

    private final SubscriptionRepository repository;
    private final ClientRepository clientRepository;
    private final PlatformRepository platformRepository;
    private final PaymentModeRepository paymentModeRepository;
    private final OperationRecorder operationRecorder;
    private final LifecycleActionRegistry actionRegistry;

    public SubscriptionService(SubscriptionRepository repository, ClientRepository clientRepository,
                                PlatformRepository platformRepository, PaymentModeRepository paymentModeRepository,
                                OperationRecorder operationRecorder, LifecycleActionRegistry actionRegistry) {
        this.repository = repository;
        this.clientRepository = clientRepository;
        this.platformRepository = platformRepository;
        this.paymentModeRepository = paymentModeRepository;
        this.operationRecorder = operationRecorder;
        this.actionRegistry = actionRegistry;
    }

    public List<SubscriptionDTO> getAll() {
        return repository.findAllWithClient()
                .stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
    }

    public SubscriptionDTO create(SubscriptionRequestDTO request) {
        Client client = clientRepository.findById(request.getClientId())
                .orElseThrow(() -> new InvalidClientReferenceException(
                        "No client exists with id " + request.getClientId()));

        platformRepository.findByName(request.getPlatform())
                .orElseThrow(() -> new InvalidPlatformException(
                        "No platform exists with name " + request.getPlatform()));

        Subscription subscription = new Subscription(null, client, request.getPlatform(),
                request.getContract(), "TR", LocalDate.now(), request.getAmount());

        if (request.getPaymentModeId() != null) {
            PaymentMode paymentMode = paymentModeRepository.findById(request.getPaymentModeId())
                    .orElseThrow(() -> new InvalidPaymentModeException(
                            "No payment mode exists with id " + request.getPaymentModeId()));
            subscription.setPaymentMode(paymentMode);
        }

        Subscription saved = repository.save(subscription);
        operationRecorder.record(saved, "CREATE", "COMPLETED", null, "Subscription created", null);
        return toDTO(saved);
    }

    public SubscriptionDetailDTO getById(Long id) {
        Subscription s = repository.findById(id)
                .orElseThrow(() -> new SubscriptionNotFoundException("No subscription exists with id " + id));

        List<String> availableActions = actionRegistry.availableActionsFor(s.getStatus());
        String clientName = s.getClient().getName() + " " + s.getClient().getLastName();

        return new SubscriptionDetailDTO(
                s.getId(),
                clientName,
                s.getClient().getEmail(),
                s.getClient().getMsisdn(),
                s.getPlatform(),
                s.getContract(),
                s.getPo(),
                s.getPaymentMode() == null ? null : s.getPaymentMode().getName(),
                s.getStatus(),
                s.getEntryDate(),
                s.getActivateDate(),
                s.getDeactivateDate(),
                s.getCancelDate(),
                s.getStartTrialDate(),
                s.getEndTrialDate(),
                s.getAmount(),
                s.getMsisdn(),
                s.getSimIccid(),
                availableActions
        );
    }

    public SubscriptionDTO toDTO(Subscription s) {
        String clientName = s.getClient().getName() + " " + s.getClient().getLastName();
        return new SubscriptionDTO(
                s.getId(),
                clientName,
                s.getClient().getEmail(),
                s.getClient().getMsisdn(),
                s.getPlatform(),
                s.getContract(),
                s.getStatus(),
                s.getEntryDate(),
                s.getAmount()
        );
    }
}
