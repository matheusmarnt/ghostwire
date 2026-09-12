<?php

use Illuminate\Support\Facades\File;

function learnedJson(array $overrides = []): string
{
    return json_encode(array_replace_recursive([
        'v' => 1,
        'e' => [
            '3141592653|lg' => [
                't' => 1757548800000,
                'n' => 'orders-table',
                'w' => 960,
                'h' => 320,
                'b' => [
                    ['type' => 'text', 'x' => 12, 'y' => 8, 'width' => 240, 'height' => 14],
                    ['type' => 'avatar', 'x' => 12, 'y' => 48, 'width' => 40, 'height' => 40],
                ],
            ],
        ],
        'c' => ['orders-table|lg' => '3141592653'],
    ], $overrides));
}

beforeEach(function () {
    $this->source = sys_get_temp_dir().'/ghostwire-learned-'.bin2hex(random_bytes(6)).'.json';
    File::put($this->source, learnedJson());
    File::ensureDirectoryExists(resource_path('views'));
});

afterEach(function () {
    File::delete($this->source);
    File::deleteDirectory(resource_path('views/livewire'));
});

it('writes a static Blade placeholder from a learned tree (SPEC-LRN-03)', function () {
    $this->artisan('ghost:export', ['--component' => 'orders-table', '--breakpoint' => 'lg', '--from' => $this->source])
        ->assertSuccessful();

    $written = File::get(resource_path('views/livewire/orders-table-placeholder.blade.php'));

    expect($written)->toContain('gw-bone gw-bone--text')
        ->and($written)->toContain('gw-bone gw-bone--avatar')
        ->and($written)->toContain('left:12.00px')
        ->and($written)->toContain('width:960.00px');
});

it('emits nothing dynamic - no Blade echo, no PHP tag (SPEC-SEC-05)', function () {
    $this->artisan('ghost:export', ['--component' => 'orders-table', '--breakpoint' => 'lg', '--from' => $this->source])
        ->assertSuccessful();

    $written = File::get(resource_path('views/livewire/orders-table-placeholder.blade.php'));

    // Finding 6: '<?' alone subsumes '<?php' and '<?=' (both start with it), and
    // a bare '@' subsumes every Blade directive by construction, present or
    // future - this is provably stronger than the original three-token list,
    // not just a different one.
    expect($written)->not->toContain('{{')
        ->and($written)->not->toContain('{!!')
        ->and($written)->not->toContain('<?')
        ->and($written)->not->toContain('@');
});

it('fails when the component is absent from the learned data', function () {
    $this->artisan('ghost:export', ['--component' => 'not-learned', '--breakpoint' => 'lg', '--from' => $this->source])
        ->assertFailed();
});

it('fails when the breakpoint is not a known band', function () {
    // Ruling D: --breakpoint is attacker-shaped input same as --component -
    // pin the refusal to the actual message, not just a non-zero exit code.
    $this->artisan('ghost:export', ['--component' => 'orders-table', '--breakpoint' => 'enormous', '--from' => $this->source])
        ->expectsOutputToContain('must be one of:')
        ->assertFailed();
});

it('fails when the source file does not exist', function () {
    $this->artisan('ghost:export', ['--component' => 'orders-table', '--breakpoint' => 'lg', '--from' => '/nope/missing.json'])
        ->assertFailed();
});

it('fails on a schema version it does not understand', function () {
    File::put($this->source, json_encode(['v' => 999, 'e' => [], 'c' => []]));

    $this->artisan('ghost:export', ['--component' => 'orders-table', '--breakpoint' => 'lg', '--from' => $this->source])
        ->assertFailed();
});

it('clamps absurd geometry rather than writing it out verbatim (SPEC-SEC-05)', function () {
    // Ruling B: built as a full literal, not via learnedJson()'s array_replace_recursive,
    // which merges the `b` array by index and would leave the fixture's original
    // second bone in place alongside this one.
    File::put($this->source, json_encode([
        'v' => 1,
        'e' => ['3141592653|lg' => [
            't' => 1757548800000,
            'n' => 'orders-table',
            'w' => 960,
            'h' => 320,
            'b' => [
                ['type' => 'text', 'x' => 999999999, 'y' => 0, 'width' => 240, 'height' => 14],
            ],
        ]],
        'c' => ['orders-table|lg' => '3141592653'],
    ]));

    $this->artisan('ghost:export', ['--component' => 'orders-table', '--breakpoint' => 'lg', '--from' => $this->source])
        ->assertSuccessful();

    expect(File::get(resource_path('views/livewire/orders-table-placeholder.blade.php')))
        ->toContain('left:20000.00px');
});

it('prints a view() hint matching the actual --output destination (Finding 9)', function () {
    // try/finally: an assertion failing mid-chain must not skip cleanup and
    // leave a file behind for the next run to trip over.
    try {
        $this->artisan('ghost:export', [
            '--component' => 'orders-table', '--breakpoint' => 'lg',
            '--from' => $this->source, '--output' => 'custom/spot.blade.php',
        ])
            ->expectsOutputToContain("view('custom.spot')")
            ->assertSuccessful();
    } finally {
        File::deleteDirectory(resource_path('views/custom'));
    }
});

it('drops a tree containing a bone type outside the whitelist (SPEC-SEC-05)', function () {
    // Ruling B: a full literal with exactly one bone. Via learnedJson()'s
    // array_replace_recursive merge, the fixture's original index-1 avatar bone
    // would survive alongside this one, and since one bad bone discards the
    // whole entry regardless of any valid sibling, the test would still pass -
    // but for a fixture that no longer matches what its name says it tests.
    File::put($this->source, json_encode([
        'v' => 1,
        'e' => ['3141592653|lg' => [
            't' => 1757548800000,
            'n' => 'orders-table',
            'w' => 960,
            'h' => 320,
            'b' => [
                ['type' => 'script', 'x' => 0, 'y' => 0, 'width' => 1, 'height' => 1],
            ],
        ]],
        'c' => ['orders-table|lg' => '3141592653'],
    ]));

    $this->artisan('ghost:export', ['--component' => 'orders-table', '--breakpoint' => 'lg', '--from' => $this->source])
        ->assertFailed();
});
