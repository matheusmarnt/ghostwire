<?php

// src/Support/ConfigResolver.php

namespace Ghostwire\Support;

use Ghostwire\Attributes\Ghost;
use InvalidArgumentException;
use ReflectionAttribute;
use ReflectionClass;
use ReflectionMethod;

final class ConfigResolver
{
    private const FIELDS = ['mode', 'only', 'except', 'delay', 'hold', 'rows', 'poll', 'sync', 'lazy'];

    private const POSITIONAL = ['mode', 'only', 'except', 'delay', 'hold', 'rows', 'poll', 'sync', 'lazy'];

    /** @var array<class-string, array<string, mixed>> */
    private array $classChainCache = [];

    /**
     * @return array{mode: string, only: ?array, except: ?array, delay: int, hold: int, rows: ?int, poll: bool, sync: bool, lazy: bool}
     */
    public function resolve(string $componentClass, ?string $method = null): array
    {
        $levels = [];
        if ($method !== null) {
            $levels[] = $this->declaredArgsForMethod($componentClass, $method);
        }
        $levels[] = $this->classChain($componentClass);

        $resolved = [];
        foreach (self::FIELDS as $field) {
            $resolved[$field] = $this->firstDeclared($levels, $field) ?? $this->packageDefault($field);
        }

        $this->validate($resolved);

        return $resolved;
    }

    /** @param array<int, array<string, mixed>> $levels */
    private function firstDeclared(array $levels, string $field): mixed
    {
        foreach ($levels as $level) {
            if (array_key_exists($field, $level)) {
                return $level[$field];
            }
        }

        return null;
    }

    /**
     * @return array<string, mixed> the package-default value for every field that has
     *                              one (mode, delay, hold, poll, sync, lazy — only/except/rows
     *                              have no non-null default, so they're excluded). Single
     *                              source of truth for consumers (e.g. GhostComponentHook's
     *                              compact-payload omission logic) that need to know which
     *                              resolved value equals "the default" without duplicating it.
     */
    public function defaults(): array
    {
        return [
            'mode' => $this->packageDefault('mode'),
            'delay' => $this->packageDefault('delay'),
            'hold' => $this->packageDefault('hold'),
            'poll' => $this->packageDefault('poll'),
            'sync' => $this->packageDefault('sync'),
            'lazy' => $this->packageDefault('lazy'),
        ];
    }

    /**
     * The package's literal default values — the same numbers hardcoded as
     * js/src/attributeConfig.js's DEFAULTS constant. Unlike defaults()/packageDefault(),
     * this never reads config() — it's what the JS runtime falls back to when a field
     * is omitted from data-ghost, so the omission decision in GhostComponentHook must
     * compare against THIS, not against a deployment's possibly-customized config value.
     *
     * @return array<string, mixed>
     */
    public function literalDefaults(): array
    {
        return [
            'mode' => 'synthesize',
            'delay' => 120,
            'hold' => 300,
            'poll' => false,
            'sync' => false,
            'lazy' => false,
        ];
    }

    private function packageDefault(string $field): mixed
    {
        return match ($field) {
            'mode' => config('ghostwire.mode', 'synthesize'),
            'only' => null,
            'except' => null,
            'delay' => config('ghostwire.timing.delay', 120),
            'hold' => config('ghostwire.timing.hold', 300),
            'rows' => null,
            // Attribute polarity is "allow" (poll: true = don't silence); config polarity
            // is "silence" (silence.poll: true = suppress by default). They are inverses.
            'poll' => ! config('ghostwire.silence.poll', true),
            'sync' => ! config('ghostwire.silence.sync', true),
            'lazy' => (bool) config('ghostwire.learning.enabled', false),
        };
    }

    /** @return array<string, mixed> merged nearest-first: concrete class wins, then each ancestor, then each trait */
    private function classChain(string $class): array
    {
        if (isset($this->classChainCache[$class])) {
            return $this->classChainCache[$class];
        }

        $levels = [];

        $current = $class;
        while ($current !== false) {
            $levels[] = $this->declaredArgsForClass($current);
            $current = get_parent_class($current);
        }

        foreach (class_uses_recursive($class) as $trait) {
            $levels[] = $this->declaredArgsForClass($trait);
        }

        $merged = [];
        foreach ($levels as $level) {
            foreach ($level as $field => $value) {
                if (! array_key_exists($field, $merged)) {
                    $merged[$field] = $value;
                }
            }
        }

        return $this->classChainCache[$class] = $merged;
    }

    /** @return array<string, mixed> only the fields actually written at the #[Ghost(...)] call site */
    private function declaredArgsForClass(string $class): array
    {
        $attributes = (new ReflectionClass($class))->getAttributes(Ghost::class);

        return $attributes === [] ? [] : $this->namedArgs($attributes[0]);
    }

    /** @return array<string, mixed> */
    private function declaredArgsForMethod(string $class, string $method): array
    {
        if (! method_exists($class, $method)) {
            return [];
        }

        $attributes = (new ReflectionMethod($class, $method))->getAttributes(Ghost::class);

        return $attributes === [] ? [] : $this->namedArgs($attributes[0]);
    }

    /**
     * ReflectionAttribute::getArguments() returns only what was textually written at the
     * call site — unlike newInstance(), it never fills in the Ghost constructor's own
     * defaults. That distinction is what makes "field not declared -> inherit" (SPEC-API-10)
     * possible at all: newInstance()->poll would always read false, even when the attribute
     * usage never mentioned poll.
     *
     * @return array<string, mixed>
     */
    private function namedArgs(ReflectionAttribute $attribute): array
    {
        $named = [];
        foreach ($attribute->getArguments() as $key => $value) {
            $name = is_int($key) ? (self::POSITIONAL[$key] ?? null) : $key;
            if ($name !== null) {
                $named[$name] = $value;
            }
        }

        return $named;
    }

    /** @param array<string, mixed> $resolved */
    private function validate(array $resolved): void
    {
        if ($resolved['only'] !== null && $resolved['except'] !== null) {
            throw new InvalidArgumentException(
                'Ghostwire: #[Ghost] "only" and "except" cannot both be set on the same resolved config (SPEC-API-23). Resolved: '.json_encode($resolved)
            );
        }
    }
}
