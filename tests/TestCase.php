<?php

namespace Ghostwire\Tests;

use Ghostwire\GhostwireServiceProvider;
use Ghostwire\Tests\Browser\Fixtures\DemoTable;
use Ghostwire\Tests\Browser\Fixtures\Gallery\CardGrid;
use Ghostwire\Tests\Browser\Fixtures\Gallery\GroupedTable;
use Ghostwire\Tests\Browser\Fixtures\Gallery\NodeCount;
use Ghostwire\Tests\Browser\Fixtures\Gallery\PaginatedTable;
use Ghostwire\Tests\Browser\Fixtures\Gallery\RepeatList;
use Ghostwire\Tests\Browser\Fixtures\Gallery\ScrollableKanban;
use Ghostwire\Tests\Browser\Fixtures\GhostAttributeProbe;
use Ghostwire\Tests\Browser\Fixtures\LazyDeclaredPlaceholder;
use Ghostwire\Tests\Browser\Fixtures\LazyOrdersTable;
use Ghostwire\Tests\Browser\Fixtures\Legacy\LegacyWidgetFive;
use Ghostwire\Tests\Browser\Fixtures\Legacy\LegacyWidgetFour;
use Ghostwire\Tests\Browser\Fixtures\Legacy\LegacyWidgetOne;
use Ghostwire\Tests\Browser\Fixtures\Legacy\LegacyWidgetThree;
use Ghostwire\Tests\Browser\Fixtures\Legacy\LegacyWidgetTwo;
use Livewire\Livewire;
use Livewire\LivewireServiceProvider;
use Orchestra\Testbench\TestCase as Orchestra;

class TestCase extends Orchestra
{
    protected function getPackageProviders($app): array
    {
        return [GhostwireServiceProvider::class, LivewireServiceProvider::class];
    }

    protected function defineEnvironment($app): void
    {
        $app['config']->set('app.key', 'base64:'.base64_encode(random_bytes(32)));
        $app['view']->addNamespace('ghostwire-fixtures', __DIR__.'/Browser/Fixtures/views');
        Livewire::component('demo-table', DemoTable::class);
        Livewire::component('paginated-table', PaginatedTable::class);
        Livewire::component('grouped-table', GroupedTable::class);
        Livewire::component('card-grid', CardGrid::class);
        Livewire::component('repeat-list', RepeatList::class);
        Livewire::component('scrollable-kanban', ScrollableKanban::class);
        Livewire::component('node-count', NodeCount::class);
        Livewire::component('ghost-attribute-probe', GhostAttributeProbe::class);
        Livewire::component('legacy-widget-one', LegacyWidgetOne::class);
        Livewire::component('legacy-widget-two', LegacyWidgetTwo::class);
        Livewire::component('legacy-widget-three', LegacyWidgetThree::class);
        Livewire::component('legacy-widget-four', LegacyWidgetFour::class);
        Livewire::component('legacy-widget-five', LegacyWidgetFive::class);
        Livewire::component('lazy-orders-table', LazyOrdersTable::class);
        Livewire::component('lazy-declared-placeholder', LazyDeclaredPlaceholder::class);
    }

    protected function defineRoutes($router): void
    {
        require __DIR__.'/Browser/Fixtures/routes.php';
    }

    protected function setUp(): void
    {
        parent::setUp();

        $publicDist = public_path('vendor/ghostwire');
        if (! is_dir($publicDist)) {
            mkdir($publicDist, 0755, true);
        }
        copy(__DIR__.'/../resources/dist/ghostwire.js', $publicDist.'/ghostwire.js');
        copy(__DIR__.'/../resources/dist/ghostwire.css', $publicDist.'/ghostwire.css');
    }
}
