ifeq ($(strip $(MAKECMDGOALS)),)
$(error DOSAI toolchain configuration proof cannot build or fetch sources)
endif
ifneq ($(filter-out %config list-defconfigs check-package,$(MAKECMDGOALS)),)
$(error DOSAI toolchain configuration proof cannot build or fetch sources)
endif
