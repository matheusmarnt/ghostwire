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
