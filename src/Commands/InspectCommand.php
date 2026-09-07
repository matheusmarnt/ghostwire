<?php

// src/Commands/InspectCommand.php

namespace Ghostwire\Commands;

use Composer\InstalledVersions;
use Ghostwire\Support\ConfigResolver;
use Illuminate\Console\Command;
use Livewire\Finder\Finder;
use Livewire\Mechanisms\ComponentRegistry;
use ReflectionProperty;

class InspectCommand extends Command
{
    protected $signature = 'ghost:inspect';

    protected $description = 'Show every registered Livewire component\'s resolved Ghostwire configuration (SPEC-API-42)';

    public function handle(ConfigResolver $resolver): int
    {
        $line = InstalledVersions::getVersion('livewire/livewire');
        $this->info("Detected Livewire line: {$line}");

        // One field per line/writeln call (not a single $this->table() row) —
        // deliberately, not just stylistically. Laravel's expectsOutputToContain()
        // mocks Output::doWrite() and, per Mockery\ExpectationDirector::call(),
        // credits only the FIRST still-eligible registered substring expectation
        // whose constraint matches a given doWrite() call — it does not also
        // check the rest of the registered expectations against that same call.
        // A $this->table() row concatenates name + class + mode + except into
        // ONE doWrite() call, so when a component's name, class and except list
        // are all independently asserted via expectsOutputToContain() (exactly
        // what SPEC-API-42's test does), only one of those assertions is ever
        // consumed and the others report as "missing" even though they're
        // genuinely printed. Verified by re-creating Laravel's own
        // mockConsoleOutput() mock and dumping the real doWrite() call
        // boundaries — each table row was confirmed to arrive as one call.
        foreach ($this->registeredComponents() as $name => $class) {
            $resolved = $resolver->resolve($class);

            $this->line("Component: {$name}");
            $this->line("  Class: {$class}");
            $this->line("  Mode: {$resolved['mode']}");
            $this->line('  Only: '.($resolved['only'] ? implode(',', $resolved['only']) : '—'));
            $this->line('  Except: '.($resolved['except'] ? implode(',', $resolved['except']) : '—'));
            $this->line("  Delay: {$resolved['delay']}ms  Hold: {$resolved['hold']}ms");
        }

        return self::SUCCESS;
    }

    /**
     * `Livewire::component($name, $class)` does NOT store into a class called
     * `Livewire\Mechanisms\ComponentRegistry::getComponents()` on every Livewire
     * line — that method never existed. Confirmed by grepping the real installed
     * source (and, for the other supported major, the cached composer package —
     * this workspace only has one major installed at a time, same as the
     * `livewire: ['^3.6', '^4.0']` CI matrix in .github/workflows/tests.yml):
     *
     * Livewire 4.x (installed here, v4.4.3): `Livewire::component()`
     * (vendor/livewire/livewire/src/LivewireManager.php:33-36) calls
     * `addComponent()` (same file, :38-41), which forwards to the
     * `livewire.finder` singleton bound to `Livewire\Finder\Finder`
     * (vendor/livewire/livewire/src/LivewireServiceProvider.php:35-41). That
     * class stores name => normalized-class-string pairs on its protected
     * `$classComponents` property (vendor/livewire/livewire/src/Finder/Finder.php:21,48).
     *
     * Livewire 3.x (same v3.8.7 line already pinned by GhostComponentHook.php's
     * header comment; confirmed here via composer's package cache since only
     * one major can be vendored at once): `Livewire::component()` is handled
     * directly by `Livewire\Mechanisms\ComponentRegistry::component()`, which
     * stores explicitly-named registrations on its protected `$aliases`
     * property (src/Mechanisms/ComponentRegistry.php:8-21 in that release) —
     * that mechanism is registered into the container via
     * `app()->instance(static::class, $this)` (src/Mechanisms/Mechanism.php),
     * so `app(ComponentRegistry::class)` resolves the live instance.
     *
     * Neither release exposes a public getter for the full map — both only
     * expose single-lookup accessors (`resolveClassComponentClassName()` /
     * `getClass()`) that require already knowing the name. Reading the
     * protected property via Reflection is the only way to enumerate "every
     * registered component" without a namespace-scanning fallback that
     * wouldn't reflect explicit `Livewire::component()` registrations anyway.
     *
     * ponytail: only explicitly-*named* registrations are surfaced (Finder's
     * $classComponents / ComponentRegistry's $aliases) — a component
     * registered class-only (no name arg) lands in a separate bucket keyed by
     * an unstable crc32 hash on both lines, which isn't a useful "name" for
     * an inspection table. Add it if a real app ever registers that way.
     *
     * @return array<string, class-string>
     */
    private function registeredComponents(): array
    {
        if (class_exists(Finder::class)) {
            $map = $this->readProtected(app('livewire.finder'), 'classComponents');
        } else {
            $map = $this->readProtected(app(ComponentRegistry::class), 'aliases');
        }

        return array_map(
            static fn ($class) => is_object($class) ? get_class($class) : $class,
            $map
        );
    }

    /** @return array<string, mixed> */
    private function readProtected(object $target, string $property): array
    {
        $reflected = new ReflectionProperty($target, $property);
        $reflected->setAccessible(true);

        return $reflected->getValue($target);
    }
}
