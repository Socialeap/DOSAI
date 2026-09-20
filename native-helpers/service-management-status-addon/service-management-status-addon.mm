#import <ServiceManagement/ServiceManagement.h>

#define NAPI_VERSION 8
#include <node_api.h>

namespace {

constexpr char kNotRegistered[] = "NOT_REGISTERED";
constexpr char kEnabled[] = "ENABLED";
constexpr char kRequiresApproval[] = "REQUIRES_APPROVAL";
constexpr char kNotFound[] = "NOT_FOUND";

napi_value MakeObservation(napi_env env, const char* observation) noexcept {
  napi_value value = nullptr;
  if (napi_create_string_utf8(env, observation, NAPI_AUTO_LENGTH, &value) != napi_ok) {
    return nullptr;
  }
  return value;
}

const char* ObserveServiceStatus() noexcept {
  @try {
    @autoreleasepool {
      SMAppService* service = [SMAppService
          agentServiceWithPlistName:@"com.socialeap.dosai.execution-service-fixture.plist"];
      if (service == nil) {
        return kNotFound;
      }
      switch (service.status) {
        case SMAppServiceStatusNotRegistered:
          return kNotRegistered;
        case SMAppServiceStatusEnabled:
          return kEnabled;
        case SMAppServiceStatusRequiresApproval:
          return kRequiresApproval;
        case SMAppServiceStatusNotFound:
          return kNotFound;
        default:
          return kNotFound;
      }
    }
  } @catch (__unused NSException* exception) {
    return kNotFound;
  }
}

napi_value Observe(napi_env env, napi_callback_info info) noexcept {
  size_t argument_count = 1;
  napi_value arguments[1] = {nullptr};
  if (napi_get_cb_info(env, info, &argument_count, arguments, nullptr, nullptr) != napi_ok
      || argument_count != 0) {
    return MakeObservation(env, kNotFound);
  }
  return MakeObservation(env, ObserveServiceStatus());
}

}  // namespace

NAPI_MODULE_INIT() {
  napi_value observe = nullptr;
  if (napi_create_function(env, "observe", NAPI_AUTO_LENGTH, Observe, nullptr, &observe)
      != napi_ok) {
    return nullptr;
  }
  if (napi_set_named_property(env, exports, "observe", observe) != napi_ok) {
    return nullptr;
  }
  return exports;
}
