#import <ServiceManagement/ServiceManagement.h>

#define NAPI_VERSION 8
#include <node_api.h>

namespace {

constexpr char kPlistName[] =
    "com.socialeap.dosai.execution-service-fixture.plist";
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

napi_value MakeBoolean(napi_env env, bool result) noexcept {
  napi_value value = nullptr;
  if (napi_get_boolean(env, result, &value) != napi_ok) {
    return nullptr;
  }
  return value;
}

bool HasZeroArguments(napi_env env, napi_callback_info info) noexcept {
  size_t argument_count = 1;
  napi_value arguments[1] = {nullptr};
  return napi_get_cb_info(env, info, &argument_count, arguments, nullptr, nullptr) == napi_ok
      && argument_count == 0;
}

SMAppService* FixedService() noexcept {
  return [SMAppService agentServiceWithPlistName:
      [NSString stringWithUTF8String:kPlistName]];
}

const char* ObserveServiceStatus() noexcept {
  @try {
    @autoreleasepool {
      SMAppService* service = FixedService();
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

bool RegisterService() noexcept {
  @try {
    @autoreleasepool {
      SMAppService* service = FixedService();
      if (service == nil) {
        return false;
      }
      NSError* error = nil;
      const BOOL registered = [service registerAndReturnError:&error];
      return registered == YES && error == nil;
    }
  } @catch (__unused NSException* exception) {
    return false;
  }
}

bool UnregisterService() noexcept {
  @try {
    @autoreleasepool {
      SMAppService* service = FixedService();
      if (service == nil) {
        return false;
      }
      NSError* error = nil;
      const BOOL unregistered = [service unregisterAndReturnError:&error];
      return unregistered == YES && error == nil;
    }
  } @catch (__unused NSException* exception) {
    return false;
  }
}

napi_value Observe(napi_env env, napi_callback_info info) noexcept {
  if (!HasZeroArguments(env, info)) {
    return MakeObservation(env, kNotFound);
  }
  return MakeObservation(env, ObserveServiceStatus());
}

napi_value Register(napi_env env, napi_callback_info info) noexcept {
  if (!HasZeroArguments(env, info)) {
    return MakeBoolean(env, false);
  }
  return MakeBoolean(env, RegisterService());
}

napi_value Unregister(napi_env env, napi_callback_info info) noexcept {
  if (!HasZeroArguments(env, info)) {
    return MakeBoolean(env, false);
  }
  return MakeBoolean(env, UnregisterService());
}

bool ExportFunction(
    napi_env env,
    napi_value exports,
    const char* name,
    napi_callback callback) noexcept {
  napi_value function = nullptr;
  return napi_create_function(env, name, NAPI_AUTO_LENGTH, callback, nullptr, &function) == napi_ok
      && napi_set_named_property(env, exports, name, function) == napi_ok;
}

}  // namespace

NAPI_MODULE_INIT() {
  if (!ExportFunction(env, exports, "observe", Observe)
      || !ExportFunction(env, exports, "register", Register)
      || !ExportFunction(env, exports, "unregister", Unregister)) {
    return nullptr;
  }
  return exports;
}
