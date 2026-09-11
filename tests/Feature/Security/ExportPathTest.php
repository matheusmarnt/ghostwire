<?php

use Illuminate\Support\Facades\File;

beforeEach(function () {
    $this->source = sys_get_temp_dir().'/ghostwire-sec-'.bin2hex(random_bytes(6)).'.json';
    File::put($this->source, json_encode([
        'v' => 1,
        'e' => ['1|lg' => ['t' => 1, 'n' => 'orders-table', 'w' => 100, 'h' => 50, 'b' => [
            ['type' => 'text', 'x' => 0, 'y' => 0, 'width' => 10, 'height' => 10],
        ]]],
        'c' => ['orders-table|lg' => '1'],
    ]));
    File::ensureDirectoryExists(resource_path('views'));
});

afterEach(function () {
    File::delete($this->source);
    File::deleteDirectory(resource_path('views/livewire'));
});

it('rejects a component name outside [a-z0-9.-] (SPEC-SEC-05)', function (string $name) {
    // assertFailed() alone can't tell a deliberate refusal from a crash that also
    // exits non-zero (Ruling D) - expectsOutputToContain() pins it to the actual
    // charset-refusal message, not merely "something went wrong".
    $this->artisan('ghost:export', ['--component' => $name, '--breakpoint' => 'lg', '--from' => $this->source])
        ->expectsOutputToContain('must match [a-z0-9.-]')
        ->assertFailed();
})->with([
    '../../etc/passwd',
    'Orders-Table',
    'orders table',
    'orders/table',
    'orders;rm -rf',
    '',
    "orders-table\n", // Finding 3: PCRE $ without /D matches before a trailing "\n"
]);

it('refuses any --output that escapes resources/views (SPEC-SEC-05)', function (string $output) {
    // Same reasoning as the component-charset test above: pin the refusal to the
    // path-traversal message so a future regression that merely crashes instead
    // of refusing does not slip this test (Ruling D).
    $this->artisan('ghost:export', [
        '--component' => 'orders-table', '--breakpoint' => 'lg',
        '--from' => $this->source, '--output' => $output,
    ])
        ->expectsOutputToContain('must be a relative path inside resources/views')
        ->assertFailed();
})->with([
    '../../../etc/ghostwire.blade.php',
    '/etc/ghostwire.blade.php',
    'livewire/../../../escaped.blade.php',
]);

it('refuses to overwrite an existing view without --force (SPEC-SEC-05)', function () {
    $target = resource_path('views/livewire/orders-table-placeholder.blade.php');
    File::ensureDirectoryExists(dirname($target));
    File::put($target, 'ORIGINAL');

    // The untouched-file assertion below would also hold if the command merely
    // crashed before ever reaching the overwrite check, so pin the message too
    // (Ruling D): this is specifically the --force refusal, not any other failure.
    $this->artisan('ghost:export', ['--component' => 'orders-table', '--breakpoint' => 'lg', '--from' => $this->source])
        ->expectsOutputToContain('already exists. Pass --force to overwrite it.')
        ->assertFailed();

    expect(File::get($target))->toBe('ORIGINAL');
});

it('overwrites an existing view when --force is given (SPEC-SEC-05)', function () {
    $target = resource_path('views/livewire/orders-table-placeholder.blade.php');
    File::ensureDirectoryExists(dirname($target));
    File::put($target, 'ORIGINAL');

    $this->artisan('ghost:export', [
        '--component' => 'orders-table', '--breakpoint' => 'lg',
        '--from' => $this->source, '--force' => true,
    ])->assertSuccessful();

    expect(File::get($target))->not->toBe('ORIGINAL');
});

it('fails, not succeeds, when the resolved target is an existing directory (Finding 1)', function () {
    // A real-world trap: resources/views/livewire already exists on almost any
    // Livewire app, so `--output=livewire` (missing the filename) resolves onto
    // that directory. Without a guard, is_file() is false (a directory isn't a
    // "file"), the --force gate never trips, and file_put_contents() fails with
    // an unsuppressed E_WARNING while the command still reports success.
    File::ensureDirectoryExists(resource_path('views/livewire'));

    $this->artisan('ghost:export', [
        '--component' => 'orders-table', '--breakpoint' => 'lg',
        '--from' => $this->source, '--output' => 'livewire',
    ])
        ->expectsOutputToContain('directory')
        ->assertFailed();
});

it('refuses to write through a dangling symlink at the target path (Finding 2)', function () {
    // The most severe shape: is_file() on a dangling symlink is false (nothing
    // exists at the far end yet), so the --force gate never trips either - and
    // file_put_contents() follows the link, creating a file wherever it points,
    // with no --force needed at all.
    $target = resource_path('views/livewire/orders-table-placeholder.blade.php');
    File::ensureDirectoryExists(dirname($target));
    $danglingAt = sys_get_temp_dir().'/ghostwire-dangling-'.bin2hex(random_bytes(6));
    symlink($danglingAt, $target);

    $this->artisan('ghost:export', ['--component' => 'orders-table', '--breakpoint' => 'lg', '--from' => $this->source])
        ->expectsOutputToContain('symlink')
        ->assertFailed();

    expect(File::exists($danglingAt))->toBeFalse();
});

it('refuses to overwrite through a live symlink even with --force (Finding 2)', function () {
    $target = resource_path('views/livewire/orders-table-placeholder.blade.php');
    File::ensureDirectoryExists(dirname($target));
    $outsideFile = sys_get_temp_dir().'/ghostwire-outside-'.bin2hex(random_bytes(6)).'.blade.php';
    File::put($outsideFile, 'OUTSIDE');
    symlink($outsideFile, $target);

    $this->artisan('ghost:export', [
        '--component' => 'orders-table', '--breakpoint' => 'lg',
        '--from' => $this->source, '--force' => true,
    ])
        ->expectsOutputToContain('symlink')
        ->assertFailed();

    expect(File::get($outsideFile))->toBe('OUTSIDE');
    File::delete($outsideFile);
});

it('refuses an --output containing a null byte (Finding 8: previously-unreachable branch)', function () {
    $this->artisan('ghost:export', [
        '--component' => 'orders-table', '--breakpoint' => 'lg',
        '--from' => $this->source, '--output' => "evil\0.blade.php",
    ])
        ->expectsOutputToContain('illegal character')
        ->assertFailed();
});

it('refuses when a parent segment is a symlink resolving outside resources/views (Finding 8: previously-unreachable branch)', function () {
    // Every --output dataset row above escapes via the LEXICAL check (a literal
    // ".."), so the separate canonical-containment refusal a few lines later in
    // resolveTarget() - reached only once realpath() resolves a symlinked
    // parent segment outside the root - had no test landing on it at all.
    $outsideDir = sys_get_temp_dir().'/ghostwire-outside-dir-'.bin2hex(random_bytes(6));
    File::ensureDirectoryExists($outsideDir);
    symlink($outsideDir, resource_path('views/escape'));

    $this->artisan('ghost:export', [
        '--component' => 'orders-table', '--breakpoint' => 'lg',
        '--from' => $this->source, '--output' => 'escape/name.blade.php',
    ])
        ->expectsOutputToContain('Refusing to write outside resources/views')
        ->assertFailed();

    File::delete(resource_path('views/escape'));
    File::deleteDirectory($outsideDir);
});
