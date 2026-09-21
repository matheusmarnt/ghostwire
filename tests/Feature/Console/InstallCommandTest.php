<?php

// tests/Feature/Console/InstallCommandTest.php

use Illuminate\Support\Facades\File;

it('publishes the compiled assets to public/vendor/ghostwire', function () {
    // tests/TestCase.php's setUp() unconditionally copies these files in before
    // every test (browser tests need them served for real) - delete them first
    // so this assertion can only pass because ghost:install itself published them.
    File::deleteDirectory(public_path('vendor/ghostwire'));

    expect(public_path('vendor/ghostwire/ghostwire.js'))->not->toBeFile();
    expect(public_path('vendor/ghostwire/ghostwire.css'))->not->toBeFile();

    $this->artisan('ghost:install')->assertExitCode(0);

    expect(public_path('vendor/ghostwire/ghostwire.js'))->toBeFile();
    expect(public_path('vendor/ghostwire/ghostwire.css'))->toBeFile();
});

it('reminds the developer to add the Blade directives', function () {
    $this->artisan('ghost:install')
        ->expectsOutputToContain('@ghostwireStyles')
        ->expectsOutputToContain('@ghostwireScripts')
        ->assertExitCode(0);
});
