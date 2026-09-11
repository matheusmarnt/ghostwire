<?php

// src/Commands/ExportCommand.php

namespace Ghostwire\Commands;

use Ghostwire\Support\LearnedTree;
use Ghostwire\Support\ViewportBands;
use Illuminate\Console\Command;

class ExportCommand extends Command
{
    protected $signature = 'ghost:export
        {--component= : Livewire component name, e.g. orders-table}
        {--breakpoint=lg : Viewport band the tree was learned at}
        {--from= : Path to the JSON produced by Ghostwire.exportLearned() in the browser}
        {--output= : Destination path relative to resources/views}
        {--force : Overwrite an existing view}';

    protected $description = 'Export a learned Bone Tree as a static Blade view usable as a Livewire @placeholder (SPEC-LRN-03). Reads a JSON file downloaded from the browser - no headless browser is involved at any point.';

    public function handle(): int
    {
        $component = (string) $this->option('component');

        if (! preg_match(LearnedTree::NAME_PATTERN, $component)) {
            $this->error('The --component option must match [a-z0-9.-] and be 1-64 characters long.');

            return self::FAILURE;
        }

        $band = (string) $this->option('breakpoint');

        if (! ViewportBands::isValid($band)) {
            $this->error('The --breakpoint option must be one of: '.ViewportBands::list().'.');

            return self::FAILURE;
        }

        $from = (string) $this->option('from');

        if ($from === '' || ! is_file($from) || ! is_readable($from)) {
            $this->error('The --from option must point at a readable JSON file produced by Ghostwire.exportLearned().');

            return self::FAILURE;
        }

        $entry = LearnedTree::fromJson((string) file_get_contents($from), $component, $band);

        if ($entry === null) {
            $this->error("No valid learned tree for component [{$component}] at breakpoint [{$band}] in that file.");

            return self::FAILURE;
        }

        $target = $this->resolveTarget($component);

        if ($target === null) {
            return self::FAILURE;
        }

        // Finding 2: never write through the target itself if it's a symlink -
        // live or dangling, and regardless of --force, since --force means
        // "overwrite a plain file this command wrote before", not "follow a
        // link to wherever it points". Finding 1: never write onto an existing
        // directory either (e.g. --output=livewire resolving onto the
        // directory most Livewire apps already have at that path) - is_file()
        // is false for both a directory and a dangling symlink, so neither
        // would otherwise trip the --force gate below at all.
        if (is_link($target) || is_dir($target)) {
            $this->error("[{$target}] is a symlink or a directory. Refusing to write through or over it.");

            return self::FAILURE;
        }

        if (is_file($target) && ! $this->option('force')) {
            $this->error("[{$target}] already exists. Pass --force to overwrite it.");

            return self::FAILURE;
        }

        // Finding 1: an unwritable directory or a full disk fails the same way
        // a pre-existing directory target does - file_put_contents() returns
        // false and emits its own E_WARNING rather than throwing, so the
        // return value is the only signal available.
        if (file_put_contents($target, LearnedTree::toBlade($entry)) === false) {
            $this->error("Could not write [{$target}].");

            return self::FAILURE;
        }

        $this->info("Wrote {$target}");
        $this->line('Bones: '.count($entry['bones']));
        $this->line('Use it from your component:');
        $this->line("    public function placeholder() { return view('{$this->viewNameFor($target)}'); }");

        return self::SUCCESS;
    }

    /**
     * Finding 9: the dot-separated view name Laravel's view() resolves from a
     * path under resources/views. Must be derived from where --output actually
     * placed the file, not hardcoded to the livewire/ default.
     */
    private function viewNameFor(string $target): string
    {
        $root = (string) realpath(resource_path('views'));
        $relative = substr($target, strlen($root) + 1);
        $relative = preg_replace('/\.blade\.php$/', '', $relative) ?? $relative;

        return str_replace(['/', '\\'], '.', $relative);
    }

    /**
     * SPEC-SEC-05: refuse any write outside resources/views. The lexical check
     * below (before any path is built) refuses ".." segments and absolute
     * paths outright; the canonical check after it (once the parent directory
     * exists) refuses anything where a symlinked parent segment resolves
     * outside the root. Between those two, mkdir() can still create a
     * directory through a symlinked parent before the canonical check catches
     * it - the WRITE itself is always refused either way, but this method does
     * not guarantee zero filesystem side effects before that refusal. handle()
     * separately refuses the resolved target itself when it is a symlink or an
     * existing directory, before ever attempting the write (Findings 1 and 2).
     */
    private function resolveTarget(string $component): ?string
    {
        $relative = (string) ($this->option('output') ?: "livewire/{$component}-placeholder.blade.php");

        if (str_contains($relative, "\0")) {
            $this->error('The --output option contains an illegal character.');

            return null;
        }

        $segments = preg_split('#[\\\\/]+#', $relative) ?: [];

        if ($segments === [] || $segments[0] === '' || in_array('..', $segments, true) || preg_match('/^[A-Za-z]:$/', $segments[0])) {
            $this->error('The --output option must be a relative path inside resources/views.');

            return null;
        }

        $root = realpath(resource_path('views'));

        if ($root === false) {
            $this->error('resources/views does not exist.');

            return null;
        }

        $target = $root.DIRECTORY_SEPARATOR.implode(DIRECTORY_SEPARATOR, $segments);
        $parent = dirname($target);

        if (! is_dir($parent) && ! mkdir($parent, 0755, true) && ! is_dir($parent)) {
            $this->error("Could not create [{$parent}].");

            return null;
        }

        $parentReal = realpath($parent);

        if ($parentReal === false || ! str_starts_with($parentReal.DIRECTORY_SEPARATOR, $root.DIRECTORY_SEPARATOR)) {
            $this->error('Refusing to write outside resources/views.');

            return null;
        }

        return $parentReal.DIRECTORY_SEPARATOR.basename($target);
    }
}
