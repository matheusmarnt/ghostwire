<?php

// tests/Feature/AssetDeliveryTest.php

use Ghostwire\GhostwireServiceProvider;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\File;

it('auto-publishes assets at boot when local and assets are missing', function () {
    // boot() already ran once during TestCase::setUp(), before this test could
    // set the environment, so exercise the method directly on a fresh instance
    // rather than relying on the app's real boot cycle.
    File::deleteDirectory(public_path('vendor/ghostwire'));

    $this->app['env'] = 'local';

    $provider = new GhostwireServiceProvider($this->app);
    $method = new ReflectionMethod($provider, 'autoPublishAssetsInDev');
    $method->setAccessible(true);
    $method->invoke($provider);

    expect(public_path('vendor/ghostwire/ghostwire.js'))->toBeFile();
    expect(public_path('vendor/ghostwire/ghostwire.css'))->toBeFile();
});

it('does not touch the filesystem in production when assets are missing', function () {
    File::deleteDirectory(public_path('vendor/ghostwire'));

    $this->app['env'] = 'production';

    $provider = new GhostwireServiceProvider($this->app);
    $method = new ReflectionMethod($provider, 'autoPublishAssetsInDev');
    $method->setAccessible(true);
    $method->invoke($provider);

    expect(File::isDirectory(public_path('vendor/ghostwire')))->toBeFalse();
});

it('emits no ghostwire asset tags when the layout never calls the directives', function () {
    $html = Blade::render('<div wire:ghost></div>');

    expect($html)->not->toContain('ghostwire.js')
        ->and($html)->not->toContain('ghostwire.css');
});

it('emits working asset tags once the layout includes both directives and assets are published', function () {
    // Do not rely on execution order with the tests above: rebuild the
    // published assets here regardless of what prior tests in this file did.
    $publicDist = public_path('vendor/ghostwire');
    File::ensureDirectoryExists($publicDist);
    File::copy(__DIR__.'/../../resources/dist/ghostwire.js', $publicDist.'/ghostwire.js');
    File::copy(__DIR__.'/../../resources/dist/ghostwire.css', $publicDist.'/ghostwire.css');

    $html = Blade::render('@ghostwireStyles @ghostwireScripts <div wire:ghost></div>');

    expect($html)->toContain(asset('vendor/ghostwire/ghostwire.css'))
        ->and($html)->toContain(asset('vendor/ghostwire/ghostwire.js'));
});
