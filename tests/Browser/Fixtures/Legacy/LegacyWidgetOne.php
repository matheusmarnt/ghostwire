<?php

// tests/Browser/Fixtures/Legacy/LegacyWidgetOne.php

namespace Ghostwire\Tests\Browser\Fixtures\Legacy;

class LegacyWidgetOne extends LegacyBaseComponent
{
    public function render()
    {
        return view('ghostwire-fixtures::legacy.legacy-widget-one');
    }

    public function refreshBadge(): void {}
}
