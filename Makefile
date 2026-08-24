ifneq ($(shell which tput),)
	ifneq ($(TERM),)
		RED    := $(shell tput setaf 1)
		GREEN  := $(shell tput setaf 2)
		YELLOW := $(shell tput setaf 3)
		CYAN   := $(shell tput setaf 6)
		RESET  := $(shell tput sgr0)
	endif
endif

# ==============================================================================
# FORMAT
# ==============================================================================

format:
	@pre-commit run prettier-js --all-files

# ==============================================================================
# LINT & TEST
# ==============================================================================

lint:
	@pnpm exec oxlint .

test:
	@pnpm exec vitest run

# ==============================================================================
# PUBLISH
# ==============================================================================

bump-version:
	@BUMP=$(word 2,$(MAKECMDGOALS)); \
	VALID_BUMP="major minor patch premajor preminor prepatch prerelease"; \
	if [ -z "$$BUMP" ]; then \
		echo "$(RED)Error: Bump is required.$(RESET)"; \
		echo "Usage: make bump-version [major|minor|patch|premajor|preminor|prepatch|prerelease]"; \
		exit 1; \
	fi; \
	if ! echo "$$VALID_BUMP" | grep -qw "$$BUMP"; then \
		echo "$(RED)Error: Invalid bump '$$BUMP'.$(RESET)"; \
		echo "Must be one of: $(CYAN)$$VALID_BUMP$(RESET)"; \
		exit 1; \
	fi; \
	pnpm version $$BUMP;

create-release:
	@VERSION=$$(pnpm pkg get version | tr -d '"'); \
	gh release create $$VERSION; \
	git fetch --tags;

publish:
	pnpm publish

# Prevent make from treating arguments to bump-version as targets
ifeq (bump-version,$(firstword $(MAKECMDGOALS)))
%:
	@:
endif
