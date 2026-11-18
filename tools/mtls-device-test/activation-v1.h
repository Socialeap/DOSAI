// One-shot orchestration over supplied local resources. No descriptor creation.
#ifndef DOSAI_FIXTURE_MTLS_ACTIVATION_V1
#define DOSAI_FIXTURE_MTLS_ACTIVATION_V1

#include "operator-v1.h"

typedef struct {
    Device device;
    TransportDriver transport;
    OperatorDriver pairing;
    OperatorDriver review;
    DriverClock clock;
    unsigned char local_plan[DIGEST];
    bool proposal_claimed;
    bool decision_taken;
    bool stopped;
} DeviceActivation;

typedef enum {
    LOCAL_REVIEW_PENDING, LOCAL_REVIEW_CONFIRMED, LOCAL_REVIEW_DENIED, LOCAL_REVIEW_STOPPED
} ActivationDecision;

static bool activation_prepare(DeviceActivation *run, int role, DeviceScope scope, time_t start_utc,
                               unsigned policy_generation, DriverClock clock)
{
    if (clock.elapsed == NULL || !device_init(&run->device, role, scope, start_utc, policy_generation))
        return false;
    run->clock = clock;
    return true;
}

static void activation_stop(DeviceActivation *run)
{
    run->stopped = true;
    OPENSSL_cleanse(run->local_plan, sizeof(run->local_plan));
    device_stop(&run->device);
    if (run->pairing.open) operator_stop(&run->pairing);
    if (run->review.open) operator_stop(&run->review);
    if (run->transport.open) transport_stop(&run->transport);
}

static void activation_policy_changed(DeviceActivation *run, unsigned current)
{
    device_policy_changed(&run->device, current);
    if (current != run->device.policy_generation) activation_stop(run);
}

// The caller supplies already-authorized local resources. The transport
// cannot be adopted before the role's distinct pairing prompt has succeeded.
static bool activation_pair(DeviceActivation *run, OwnedTerminal terminal,
                            const unsigned char *peer_leaf, size_t size)
{
    if (run->stopped || run->device.stage != DEVICE_PAIRING || run->pairing.used) return false;
    if (operator_pair(&run->pairing, &run->device, terminal, run->clock, peer_leaf, size)) return true;
    activation_stop(run);
    return false;
}

static bool activation_transport(DeviceActivation *run, OwnedStream stream)
{
    if (run->stopped || run->pairing.open || run->device.stage != DEVICE_PAIRED) return false;
    if (transport_start(&run->transport, &run->device, stream, run->clock)) return true;
    activation_stop(run);
    return false;
}

static bool activation_step(DeviceActivation *run)
{
    bool advanced;
    if (run->pairing.open) advanced = operator_step(&run->pairing);
    else if (run->transport.open) advanced = transport_step(&run->transport);
    else if (run->review.open) advanced = operator_step(&run->review);
    else return false;
    if (!advanced) activation_stop(run);
    return advanced;
}

static DeviceProposal activation_take_proposal(DeviceActivation *run)
{
    unsigned elapsed;
    if (run->stopped || run->device.role != M4 || run->proposal_claimed || run->transport.open) return DEVICE_NO_PROPOSAL;
    if (!run->clock.elapsed(run->clock.context, &elapsed)) {
        activation_stop(run);
        return DEVICE_NO_PROPOSAL;
    }
    DeviceProposal proposal = device_review_proposal(&run->device, elapsed);
    if (proposal != DEVICE_NO_PROPOSAL) run->proposal_claimed = true;
    return proposal;
}

static bool activation_review(DeviceActivation *run, OwnedTerminal terminal,
                              const unsigned char digest[DIGEST])
{
    if (run->stopped || !run->proposal_claimed || run->review.used) return false;
    if (!operator_review(&run->review, &run->device, terminal, run->clock, digest)) {
        activation_stop(run);
        return false;
    }
    memcpy(run->local_plan, run->device.plan, DIGEST);
    return true;
}

static ActivationDecision activation_take_decision(DeviceActivation *run, unsigned char binding[DIGEST])
{
    if (binding == NULL || !run->proposal_claimed || run->decision_taken || run->review.open) return LOCAL_REVIEW_PENDING;
    if (!run->stopped && (run->device.stage == DEVICE_LOCAL_CONFIRMATION_ONLY ||
                          run->device.stage == DEVICE_DENIED)) {
        unsigned elapsed;
        if (!run->clock.elapsed(run->clock.context, &elapsed) || elapsed < run->device.tick ||
            elapsed >= run->device.deadline || elapsed >= 200) activation_stop(run);
    }
    // Mark irrevocably consumed before exposing a terminal disposition.
    ActivationDecision decision;
    if (run->stopped || run->device.stage == DEVICE_FAILED) decision = LOCAL_REVIEW_STOPPED;
    else if (run->device.stage == DEVICE_LOCAL_CONFIRMATION_ONLY) decision = LOCAL_REVIEW_CONFIRMED;
    else if (run->device.stage == DEVICE_DENIED) decision = LOCAL_REVIEW_DENIED;
    else return LOCAL_REVIEW_PENDING;
    run->decision_taken = true;
    if (decision == LOCAL_REVIEW_STOPPED) memset(binding, 0, DIGEST);
    else memcpy(binding, run->local_plan, DIGEST);
    OPENSSL_cleanse(run->local_plan, sizeof(run->local_plan));
    return decision;
}

#endif
