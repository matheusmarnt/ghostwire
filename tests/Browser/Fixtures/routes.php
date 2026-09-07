<?php

use Illuminate\Support\Facades\Route;

Route::view('/ghostwire-test-page', 'ghostwire-fixtures::page', ['component' => 'demo-table']);

Route::view('/gallery/paginated-table', 'ghostwire-fixtures::page', ['component' => 'paginated-table']);
Route::view('/gallery/grouped-table', 'ghostwire-fixtures::page', ['component' => 'grouped-table']);
Route::view('/gallery/card-grid', 'ghostwire-fixtures::page', ['component' => 'card-grid']);
Route::view('/gallery/repeat-list', 'ghostwire-fixtures::page', ['component' => 'repeat-list']);
Route::view('/gallery/scrollable-kanban', 'ghostwire-fixtures::page', ['component' => 'scrollable-kanban']);
Route::view('/gallery/node-count', 'ghostwire-fixtures::page', ['component' => 'node-count']);

Route::view('/ghostwire-ghost-attribute-probe', 'ghostwire-fixtures::page', ['component' => 'ghost-attribute-probe']);

Route::view('/legacy/legacy-widget-one', 'ghostwire-fixtures::page', ['component' => 'legacy-widget-one']);
Route::view('/legacy/legacy-widget-two', 'ghostwire-fixtures::page', ['component' => 'legacy-widget-two']);
Route::view('/legacy/legacy-widget-three', 'ghostwire-fixtures::page', ['component' => 'legacy-widget-three']);
Route::view('/legacy/legacy-widget-four', 'ghostwire-fixtures::page', ['component' => 'legacy-widget-four']);
Route::view('/legacy/legacy-widget-five', 'ghostwire-fixtures::page', ['component' => 'legacy-widget-five']);
