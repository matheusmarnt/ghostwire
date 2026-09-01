<?php

namespace Ghostwire\Tests;

use Ghostwire\GhostwireServiceProvider;
use Orchestra\Testbench\TestCase as Orchestra;

class TestCase extends Orchestra
{
    protected function getPackageProviders($app): array
    {
        return [GhostwireServiceProvider::class];
    }
}
